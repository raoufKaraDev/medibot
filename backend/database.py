"""SQLite database access and schema initialization."""
import json
import os
import sqlite3
import time
from pathlib import Path

from passlib.context import CryptContext

import seed
from config import DB_PATH
from helpers import calc_dose_ml, hash_password, rows_to_list

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def write_audit(
    conn,
    actor=None,
    actor_role=None,
    action=None,
    target_type=None,
    target_id=None,
    detail=None,
    **extra,
):
    try:
        # Ensure actor is never NULL - use "system" as fallback
        actor = (actor or "").strip() or "system"
        conn.execute(
            "INSERT INTO audit_log(actor,actor_role,action,target_type,target_id,detail) VALUES (?,?,?,?,?,?)",
            (
                actor,
                actor_role,
                action,
                target_type,
                target_id,
                json.dumps(detail, ensure_ascii=False) if detail is not None else None,
            ),
        )
        conn.commit()
    except Exception as e:
        print(f"Audit log error: {e}")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def safe_api(func):
    async def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
            if hasattr(result, '__await__'):
                return await result
            return result
        except Exception as e:
            print(f"[API ERROR] {type(e).__name__}: {e}")
            raise
    return wrapper


def _ensure_pin_hashes(conn) -> None:
    c = conn.cursor()
    for r in c.execute("SELECT id, pin, pin_hash FROM doctors").fetchall():
        d = dict(r)
        if d.get("pin_hash") or not d.get("pin"):
            continue
        try:
            ph = pwd_context.hash(str(d["pin"]))
            c.execute("UPDATE doctors SET pin_hash=? WHERE id=?", (ph, d["id"]))
        except Exception as ex:
            print(f"[pin_hash] {ex}")
    conn.commit()


def _migrate_doctor_roles_to_new_format(conn) -> None:
    """Migrates old doctor role names to new role slug format."""
    c = conn.cursor()
    role_mapping = {
        "Médecin Chef Pédiatrie": "CHEF_SERVICE",
        "Médecin Chef": "CHEF_SERVICE",
        "Médecin": "MEDECIN_GENERALISTE",
        "Pédiatre": "MEDECIN_SPECIALISTE",
        "Interne": "MEDECIN_RESIDENT",
        "Infirmiere": "INFIRMIER",
        "Infirmier(e)": "INFIRMIER",
    }
    for old_role, new_role in role_mapping.items():
        c.execute("UPDATE doctors SET role=? WHERE role=?", (new_role, old_role))
    conn.commit()


def _migrate_prescriptions_to_ordonnances(conn) -> None:
    """Crée une ordonnance + lignes à partir des prescriptions existantes si la table est vide."""
    c = conn.cursor()
    n = c.execute("SELECT COUNT(*) FROM ordonnances").fetchone()[0]
    if n and n > 0:
        return
    for prow in c.execute("SELECT id FROM patients").fetchall():
        pid = prow["id"]
        presc = c.execute(
            """SELECT pr.medication_id, m.volume_ampoule_ml, m.dose_ampoule_mg,
                      COALESCE(m.distributed_by_robot,1) AS distributed_by_robot
               FROM prescriptions pr JOIN medications m ON m.id=pr.medication_id
               WHERE pr.patient_id=?""",
            (pid,),
        ).fetchall()
        if not presc:
            continue
        c.execute(
            """INSERT INTO ordonnances(patient_id, prescripteur_id, statut, notes)
               VALUES (?,?,?,?)""",
            (pid, None, "active", "Migré depuis prescriptions"),
        )
        oid = c.lastrowid
        for row in presc:
            d = dict(row)
            vol = d.get("volume_ampoule_ml")
            d_amp = d.get("dose_ampoule_mg")
            dose_mg = 0.0
            if vol is not None and d_amp is not None and float(d_amp) > 0:
                dose_mg = float(d_amp) * 0.25
            dose_ml = calc_dose_ml(dose_mg, vol, d_amp)
            c.execute(
                """INSERT INTO lignes_ordonnance(ordonnance_id, medicament_id, medicament_libre, dose_mg, dose_ml,
                    nb_prises_par_jour, duree_jours, moment_prise, distributed_by_robot)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    oid,
                    d["medication_id"],
                    None,
                    dose_mg,
                    dose_ml,
                    1,
                    3,
                    "apres_repas",
                    int(d.get("distributed_by_robot") or 1),
                ),
            )
    conn.commit()


def _ensure_doctor_columns(conn) -> None:
    """Ensure all required columns exist in the doctors table."""
    c = conn.cursor()
    columns = {
        "username": "TEXT",
        "password_hash": "TEXT",
        "phone": "TEXT",
        "status": "TEXT DEFAULT 'ACTIVE'",
        "pin_hash": "TEXT",
    }
    for col, type_ in columns.items():
        try:
            c.execute(f"ALTER TABLE doctors ADD COLUMN {col} {type_}")
        except sqlite3.OperationalError:
            pass  # Column already exists
    conn.commit()


def _ensure_single_doctor(conn) -> None:
    """Enforce a single doctor model: Dr. KARA Abderraouf."""
    c = conn.cursor()
    
    # Target doctor details
    target_rfid = "3E487B89"
    target_name = "Dr. KARA Abderraouf"
    target_username = "kara"
    target_password = "kara1235"
    target_pin = "1234"
    target_role = "CHEF_SERVICE"
    
    from helpers import hash_password
    pwd_hash = hash_password(target_password)
    pin_h = pwd_context.hash(target_pin)

    # 1. Remove all other doctors
    c.execute("DELETE FROM doctors WHERE rfid_uid != ?", (target_rfid,))
    
    # 2. Check if target doctor exists
    existing = c.execute("SELECT id FROM doctors WHERE rfid_uid = ?", (target_rfid,)).fetchone()
    
    if existing:
        # Update existing doctor to match target credentials
        c.execute("""
            UPDATE doctors 
            SET name=?, username=?, password_hash=?, pin=?, pin_hash=?, role=?, status='ACTIVE'
            WHERE rfid_uid=?
        """, (target_name, target_username, pwd_hash, target_pin, pin_h, target_role, target_rfid))
    else:
        # Create the single doctor
        c.execute("""
            INSERT INTO doctors (rfid_uid, name, username, password_hash, pin, pin_hash, role, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        """, (target_rfid, target_name, target_username, pwd_hash, target_pin, pin_h, target_role))
    
    conn.commit()


def init_db():
    conn = get_db(); c = conn.cursor()
    
    # ── Clean up any stale DEMO data on startup ──────────────────────────────────
    try:
        c.execute("DELETE FROM dispense_log WHERE med_name LIKE '%DEMO%'")
        c.execute("DELETE FROM pharmacy_stock WHERE name LIKE '%DEMO%'")
        conn.commit()
    except Exception:
        pass
    
    c.executescript("""
        CREATE TABLE IF NOT EXISTS doctors (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            rfid_uid      TEXT    UNIQUE NOT NULL,
            name          TEXT    NOT NULL,
            username      TEXT,
            password_hash TEXT,
            role          TEXT    NOT NULL DEFAULT 'Médecin',
            pin           TEXT    NOT NULL,
            pin_hash      TEXT,
            phone         TEXT,
            status        TEXT    DEFAULT 'ACTIVE',
            created_at    TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS rooms (
            id       INTEGER PRIMARY KEY,
            name     TEXT    NOT NULL,
            capacity INTEGER DEFAULT 2
        );
        CREATE TABLE IF NOT EXISTS patients (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT    NOT NULL,
            last_name  TEXT    NOT NULL,
            age        INTEGER,
            weight     TEXT,
            blood_type TEXT,
            diagnostic TEXT,
            room_id    INTEGER REFERENCES rooms(id),
            bed        INTEGER DEFAULT 1,
            allergies  TEXT    DEFAULT '[]',
            notes      TEXT    DEFAULT '',
            photo      TEXT,
            taille     INTEGER,
            pcranien   REAL,
            poidsnaissance REAL,
            poidsref   REAL,
            vaccination_status TEXT DEFAULT 'inconnu',
            vaccinations TEXT DEFAULT '[]',
            created_at TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS guardians (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            name         TEXT    NOT NULL,
            phone        TEXT,
            relationship TEXT    DEFAULT 'Parent',
            present      INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS medications (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT    NOT NULL,
            dosage   TEXT,
            schedule TEXT,
            drawer   INTEGER UNIQUE,
            time     TEXT
        );
        CREATE TABLE IF NOT EXISTS prescriptions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            medication_id INTEGER NOT NULL REFERENCES medications(id),
            start_date    TEXT    DEFAULT (date('now')),
            end_date      TEXT,
            UNIQUE(patient_id, medication_id)
        );
        CREATE TABLE IF NOT EXISTS dispense_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
            med_name   TEXT,
            drawer     INTEGER,
            doctor     TEXT,
            mqtt_sent  INTEGER DEFAULT 0,
            timestamp  TEXT    DEFAULT (datetime('now')),
            note       TEXT    DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS pharmacy_stock (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            dosage      TEXT    NOT NULL DEFAULT '',
            unit        TEXT    NOT NULL DEFAULT 'comprimés',
            quantity    INTEGER NOT NULL DEFAULT 0,
            min_stock   INTEGER NOT NULL DEFAULT 10,
            expiry_date TEXT,
            drawer      INTEGER,
            location    TEXT    DEFAULT 'Pharmacie',
            maxdosemg24h REAL,
            updated_at  TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS prescription_docs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            doctor_name TEXT    NOT NULL,
            date        TEXT    NOT NULL DEFAULT (date('now')),
            notes       TEXT    DEFAULT '',
            created_at  TEXT    DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS prescription_items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_id INTEGER NOT NULL REFERENCES prescription_docs(id) ON DELETE CASCADE,
            med_name        TEXT    NOT NULL,
            dosage          TEXT    NOT NULL DEFAULT '',
            frequency       TEXT    NOT NULL DEFAULT '',
            duration        TEXT    NOT NULL DEFAULT '',
            instructions    TEXT    DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            actor_rfid TEXT,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id INTEGER,
            detail TEXT,
            value_before TEXT,
            value_after TEXT,
            timestamp TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS dossiers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            date_naissance TEXT,
            sexe TEXT DEFAULT 'M',
            nom_pere TEXT,
            nom_mere TEXT,
            telephone TEXT,
            groupe_sanguin TEXT,
            rhesus TEXT DEFAULT 'positif',
            groupe_abo TEXT,
            phenotype TEXT,
            allergies_permanentes TEXT DEFAULT '[]',
            antecedents_chroniques TEXT DEFAULT '',
            vaccinations TEXT DEFAULT '[]',
            vaccination_status TEXT DEFAULT 'inconnu',
            notes_permanentes TEXT DEFAULT '',
            createdat TEXT DEFAULT (datetime('now')),
            created_by TEXT
        );
        CREATE TABLE IF NOT EXISTS sejours (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dossier_id INTEGER NOT NULL REFERENCES dossiers(id),
            patient_id_legacy INTEGER,
            date_entree TEXT DEFAULT (date('now')),
            date_sortie TEXT,
            poids_admission TEXT,
            taille_admission REAL,
            pc_cranien REAL,
            poids_naissance REAL,
            poids_ref TEXT,
            diagnostic_entree TEXT NOT NULL,
            diagnostic_sortie TEXT,
            roomid INTEGER REFERENCES rooms(id),
            bed INTEGER DEFAULT 1,
            etat TEXT DEFAULT 'admis',
            type_sortie TEXT,
            transfert_destination TEXT,
            resume_clinique TEXT,
            traitement_sortie TEXT,
            consignes_parents TEXT,
            medecin_sortie TEXT,
            tuteur_nom TEXT,
            tuteur_telephone TEXT,
            tuteur_relation TEXT DEFAULT 'Parent',
            createdat TEXT DEFAULT (datetime('now')),
            created_by TEXT,
            updatedat TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS comptes_rendus_sortie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sejour_id INTEGER NOT NULL REFERENCES sejours(id),
            dossier_id INTEGER NOT NULL REFERENCES dossiers(id),
            date_redaction TEXT DEFAULT (datetime('now')),
            medecin_redacteur TEXT NOT NULL,
            diagnostic_principal TEXT,
            resume_sejour TEXT,
            traitement_sortie TEXT,
            ordonnance_sortie TEXT,
            consignes TEXT,
            rdv_controle TEXT,
            type_sortie TEXT,
            scam_signature INTEGER DEFAULT 0,
            createdat TEXT DEFAULT (datetime('now'))
        );
    """)


    # ══════════════════════════════════════════════════════════════
    # SCHEMA MIGRATIONS — add missing columns to existing DB tables
    # SQLite doesn't support IF NOT EXISTS on ALTER TABLE,
    # so we try each migration and ignore "duplicate column" errors.
    # ══════════════════════════════════════════════════════════════
    migrations = [
        # New lifecycle management columns
        "ALTER TABLE patients ADD COLUMN dossier_id INTEGER REFERENCES dossiers(id)",
        "ALTER TABLE patients ADD COLUMN sejour_id INTEGER REFERENCES sejours(id)",
        "ALTER TABLE patients ADD COLUMN etat TEXT DEFAULT 'admis'",
        "ALTER TABLE patients ADD COLUMN date_entree TEXT DEFAULT (date('now'))",
        "ALTER TABLE patients ADD COLUMN date_sortie TEXT",
        "ALTER TABLE patients ADD COLUMN type_sortie TEXT",
        "ALTER TABLE patients ADD COLUMN resume_clinique TEXT",
        "ALTER TABLE patients ADD COLUMN traitement_sortie TEXT",
        "ALTER TABLE patients ADD COLUMN consignes_parents TEXT",
        "ALTER TABLE patients ADD COLUMN medecin_sortie TEXT",
        "ALTER TABLE patients ADD COLUMN is_archived INTEGER DEFAULT 0",
        # prescription_docs enhancements
        "ALTER TABLE prescription_docs ADD COLUMN uuid TEXT",
        "ALTER TABLE prescription_docs ADD COLUMN updatedat TEXT DEFAULT (datetime('now'))",
        "ALTER TABLE prescription_docs ADD COLUMN modifiedby TEXT",
        "ALTER TABLE prescription_docs ADD COLUMN hospitalisation_ref TEXT",
        "ALTER TABLE prescription_docs ADD COLUMN status TEXT DEFAULT 'active'",
        # prescription_items complete redesign
        "ALTER TABLE prescription_items ADD COLUMN dose_mg REAL",
        "ALTER TABLE prescription_items ADD COLUMN dose_ml REAL",
        "ALTER TABLE prescription_items ADD COLUMN frequency_per_day INTEGER DEFAULT 1",
        "ALTER TABLE prescription_items ADD COLUMN duration_days INTEGER",
        "ALTER TABLE prescription_items ADD COLUMN timing TEXT DEFAULT 'Pendant le repas'",
        "ALTER TABLE prescription_items ADD COLUMN route TEXT DEFAULT 'Per os'",
        "ALTER TABLE prescription_items ADD COLUMN remarks TEXT",
        "ALTER TABLE prescription_items ADD COLUMN is_system INTEGER DEFAULT 1",
        "ALTER TABLE prescription_items ADD COLUMN medicationid INTEGER",
        "ALTER TABLE prescription_items ADD COLUMN dispensed INTEGER DEFAULT 0",
        "ALTER TABLE prescription_items ADD COLUMN dispensedat TEXT",
        "ALTER TABLE prescription_items ADD COLUMN dispensedby TEXT",
        "ALTER TABLE prescription_items ADD COLUMN createdat TEXT DEFAULT (datetime('now'))",
        "ALTER TABLE prescription_items ADD COLUMN updatedat TEXT DEFAULT (datetime('now'))",
        # doctors table — new columns for staff management
        "ALTER TABLE doctors ADD COLUMN username TEXT DEFAULT ''",
        "ALTER TABLE doctors ADD COLUMN passwordhash TEXT DEFAULT ''",
        "ALTER TABLE doctors ADD COLUMN phone TEXT",
        "ALTER TABLE doctors ADD COLUMN status TEXT DEFAULT 'ACTIVE'",
        # guardians table
        "ALTER TABLE guardians ADD COLUMN relationship TEXT DEFAULT 'Parent'",
        "ALTER TABLE guardians ADD COLUMN present      INTEGER DEFAULT 1",
        # patients table
        "ALTER TABLE patients  ADD COLUMN photo        TEXT",
        "ALTER TABLE patients  ADD COLUMN notes        TEXT DEFAULT ''",
        "ALTER TABLE patients  ADD COLUMN allergies    TEXT DEFAULT '[]'",
        # dispense_log table
        "ALTER TABLE dispense_log ADD COLUMN doctor    TEXT",
        "ALTER TABLE dispense_log ADD COLUMN note      TEXT DEFAULT ''",
        # medications table
        "ALTER TABLE medications ADD COLUMN time       TEXT",
        "ALTER TABLE medications ADD COLUMN schedule   TEXT",
        "ALTER TABLE medications ADD COLUMN is_high_risk INTEGER DEFAULT 0",
        "ALTER TABLE doctors ADD COLUMN photo TEXT",
        "ALTER TABLE patients ADD COLUMN notify_guardian INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN lot_number TEXT",
        "ALTER TABLE pharmacy_stock ADD COLUMN consumption_per_day REAL",
        "ALTER TABLE pharmacy_stock ADD COLUMN pediatric_mg_per_kg REAL",
        "ALTER TABLE dispense_log ADD COLUMN patient_id INTEGER",
        "ALTER TABLE dispense_log ADD COLUMN waste_reason TEXT",
        "ALTER TABLE dispense_log ADD COLUMN waste_detail TEXT",
        "ALTER TABLE doctors ADD COLUMN pin_hash TEXT",
        "ALTER TABLE doctors ADD COLUMN can_prescribe INTEGER DEFAULT 1",
        "ALTER TABLE doctors ADD COLUMN role_code TEXT DEFAULT 'medecin'",
        "ALTER TABLE doctors ADD COLUMN username TEXT DEFAULT ''",
        "ALTER TABLE doctors ADD COLUMN password_hash TEXT DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN date_naissance TEXT",
        "ALTER TABLE patients ADD COLUMN groupe_sanguin TEXT",
        "ALTER TABLE patients ADD COLUMN antecedents TEXT",
        "ALTER TABLE patients ADD COLUMN traitement_en_cours TEXT",
        "ALTER TABLE medications ADD COLUMN classe_therapeutique TEXT",
        "ALTER TABLE medications ADD COLUMN numero_lot TEXT",
        "ALTER TABLE medications ADD COLUMN concentration TEXT",
        "ALTER TABLE medications ADD COLUMN volume_ampoule_ml REAL",
        "ALTER TABLE medications ADD COLUMN dose_ampoule_mg REAL",
        "ALTER TABLE medications ADD COLUMN distributed_by_robot INTEGER DEFAULT 1",
        "ALTER TABLE pharmacy_stock ADD COLUMN classe_therapeutique TEXT",
        "ALTER TABLE pharmacy_stock ADD COLUMN numero_lot TEXT",
        "ALTER TABLE pharmacy_stock ADD COLUMN concentration TEXT",
        "ALTER TABLE pharmacy_stock ADD COLUMN volume_ampoule_ml REAL",
        "ALTER TABLE pharmacy_stock ADD COLUMN dose_ampoule_mg REAL",
        "ALTER TABLE pharmacy_stock ADD COLUMN distributed_by_robot INTEGER DEFAULT 1",
        "ALTER TABLE dispense_log ADD COLUMN dose_status TEXT DEFAULT 'delivre'",
        "ALTER TABLE dispense_log ADD COLUMN prise_confirmed_at TEXT",
        "ALTER TABLE dispense_log ADD COLUMN prise_confirmed_by TEXT",
        "ALTER TABLE patients ADD COLUMN groupe_abo TEXT DEFAULT ''",
        "ALTER TABLE patients ADD COLUMN rhesus TEXT DEFAULT 'positif'",
        "ALTER TABLE patients ADD COLUMN ph_C INTEGER DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN ph_c INTEGER DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN ph_E INTEGER DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN ph_e INTEGER DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN ph_K INTEGER DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN ph_k INTEGER DEFAULT 0",
        "ALTER TABLE patients ADD COLUMN drug_allergies TEXT DEFAULT '[]'",
        "ALTER TABLE patients ADD COLUMN other_allergies TEXT DEFAULT '[]'",
        "ALTER TABLE patients ADD COLUMN taille INTEGER",
        "ALTER TABLE patients ADD COLUMN pcranien REAL",
        "ALTER TABLE patients ADD COLUMN poidsnaissance REAL",
        "ALTER TABLE patients ADD COLUMN poidsref REAL",
        "ALTER TABLE patients ADD COLUMN vaccination_status TEXT DEFAULT 'inconnu'",
        "ALTER TABLE patients ADD COLUMN vaccinations TEXT DEFAULT '[]'",
        "ALTER TABLE pharmacy_stock ADD COLUMN therapeutic_class TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN commercial_name TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN dosage_form TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN storage_condition TEXT DEFAULT 'Température ambiante'",
        "ALTER TABLE pharmacy_stock ADD COLUMN requires_preparation INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN is_psychotropic INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN is_cold_chain INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN is_restricted_pediatric INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN max_stock INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN reception_date TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN supplier TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN barcode TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN notes TEXT DEFAULT ''",
        "ALTER TABLE pharmacy_stock ADD COLUMN is_high_risk INTEGER DEFAULT 0",
        "ALTER TABLE pharmacy_stock ADD COLUMN maxdosemg24h REAL",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass  # column already exists or table not yet created — safe to ignore

    # ── Migration: Rename patientid → patient_id in vitals table (if it exists with old name)
    try:
        # Check if vitals table exists and has patientid column
        columns = conn.execute("PRAGMA table_info(vitals)").fetchall()
        has_patientid = any(col[1] == 'patientid' for col in columns)
        if has_patientid:
            # Rename column using SQLite 3.25.0+ syntax
            conn.execute("ALTER TABLE vitals RENAME COLUMN patientid TO patient_id")
            conn.commit()
    except Exception as e:
        # If rename fails, try workaround: recreate table with correct schema
        try:
            conn.execute("""
                CREATE TABLE vitals_new AS
                SELECT id, patientid AS patient_id, temperature, respiratory_rate, spo2, 
                       diuresis, transit, glasgow, recorded_by, shift, timestamp
                FROM vitals;
            """)
            conn.execute("DROP TABLE vitals")
            conn.execute("ALTER TABLE vitals_new RENAME TO vitals")
            conn.commit()
        except Exception:
            pass  # Table already has correct schema or workaround failed — continue

    _pharmacy_backfills = [
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Pénicillines' WHERE therapeutic_class='' AND (name LIKE '%Amoxicilline%' OR name LIKE '%Ampicilline%' OR name LIKE '%Augmentin%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Céphalosporines' WHERE therapeutic_class='' AND (name LIKE '%Céfazoline%' OR name LIKE '%Cefazoline%' OR name LIKE '%Céfotaxime%' OR name LIKE '%Cefotaxime%' OR name LIKE '%Ceftizoxime%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Aminosides' WHERE therapeutic_class='' AND name LIKE '%Gentamicine%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Carbapénèmes' WHERE therapeutic_class='' AND name LIKE '%Imipenem%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Polymyxines' WHERE therapeutic_class='' AND name LIKE '%Colimycine%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Nitroimidazolés' WHERE therapeutic_class='' AND name LIKE '%Métronidazole%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Fluoroquinolones' WHERE therapeutic_class='' AND name LIKE '%Ciprofloxacine%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Antibiotique — Antituberculeux' WHERE therapeutic_class='' AND (name LIKE '%Rifamp%' OR name LIKE '%Isoniaz%' OR name LIKE '%Ethambutol%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Antalgique / Antipyrétique' WHERE therapeutic_class='' AND name LIKE '%Paracétamol%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Anti-inflammatoire (AINS)' WHERE therapeutic_class='' AND (name LIKE '%Ibuprofène%' OR name LIKE '%Diclofénac%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Corticoïde' WHERE therapeutic_class='' AND (name LIKE '%Dexaméthasone%' OR name LIKE '%Hydrocortisone%' OR name LIKE '%Méthylprednisolone%' OR name LIKE '%Prednisone%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Bronchodilatateur' WHERE therapeutic_class='' AND (name LIKE '%Salbutamol%' OR name LIKE '%Ipratropium%' OR name LIKE '%Aminophylline%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Antihistaminique' WHERE therapeutic_class='' AND name LIKE '%Cétirizine%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Psychotrope / Anticonvulsivant' WHERE therapeutic_class='' AND (name LIKE '%Phénobarbital%' OR name LIKE '%Diazépam%' OR name LIKE '%Chlorpromazine%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Psychotrope / Stupéfiant' WHERE therapeutic_class='' AND name LIKE '%Buprénorphine%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Antiviral' WHERE therapeutic_class='' AND name LIKE '%Aciclovir%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Immunoglobulines IV' WHERE therapeutic_class='' AND (name LIKE '%IG Humaine%' OR name LIKE '%Immunoglobuline%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Albumine humaine' WHERE therapeutic_class='' AND name LIKE '%Albumine%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Anticoagulant' WHERE therapeutic_class='' AND (name LIKE '%Enoxaparine%' OR name LIKE '%HBPM%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Hémostatique / Vitamine K' WHERE therapeutic_class='' AND name LIKE '%Phytoménadione%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Soluté de perfusion' WHERE therapeutic_class='' AND (name LIKE '%Glucose%' OR name LIKE '%NaCl%' OR name LIKE '%Sodium Chlorure%' OR name LIKE '%Bicarbonate%' OR name LIKE '%Ringer%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Correcteur électrolytique' WHERE therapeutic_class='' AND (name LIKE '%Potassium%' OR name LIKE '%Calcium%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Antiseptique' WHERE therapeutic_class='' AND (name LIKE '%Polyvidone%' OR name LIKE '%Chlorhexidine%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Pansement / Dispositif médical' WHERE therapeutic_class='' AND (name LIKE '%Tulle%' OR name LIKE '%Gaze%' OR name LIKE '%Compresse%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Gastro-entérologie' WHERE therapeutic_class='' AND (name LIKE '%Oméprazole%' OR name LIKE '%Phloroglucinol%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Anesthésique local' WHERE therapeutic_class='' AND name LIKE '%Lidocaïne%'",
        "UPDATE pharmacy_stock SET therapeutic_class='Anticancéreux / Immunosuppresseur' WHERE therapeutic_class='' AND (name LIKE '%Rituximab%' OR name LIKE '%Azathioprine%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Enzymothérapie substitutive' WHERE therapeutic_class='' AND (name LIKE '%Imiglucérase%' OR name LIKE '%Elosulfase%')",
        "UPDATE pharmacy_stock SET therapeutic_class='Vaccin / Diagnostique' WHERE therapeutic_class='' AND name LIKE '%Tuberculine%'",
        "UPDATE pharmacy_stock SET requires_preparation=1 WHERE (name LIKE '%PDR%' OR name LIKE '%Poudre%' OR dosage_form='Poudre injectable (à reconstituer)')",
        "UPDATE pharmacy_stock SET is_psychotropic=1 WHERE (name LIKE '%Buprénorphine%' OR name LIKE '%Diazépam%' OR name LIKE '%Phénobarbital%' OR name LIKE '%Chlorpromazine%')",
        "UPDATE pharmacy_stock SET is_cold_chain=1 WHERE (name LIKE '%Tuberculine%' OR name LIKE '%Rituximab%' OR name LIKE '%IG Humaine%' OR name LIKE '%Immunoglobuline%' OR name LIKE '%Imiglucérase%' OR name LIKE '%Elosulfase%')",
        "UPDATE pharmacy_stock SET is_restricted_pediatric=1 WHERE (name LIKE '%Ciprofloxacine%' OR name LIKE '%Aminophylline%' OR name LIKE '%Chlorpromazine%')",
        "UPDATE pharmacy_stock SET is_high_risk=1 WHERE (name LIKE '%Albumine%' OR name LIKE '%Rituximab%' OR name LIKE '%IG Humaine%' OR name LIKE '%Imipenem%' OR name LIKE '%Colimycine%' OR name LIKE '%Imiglucérase%')",
    ]
    for sql in _pharmacy_backfills:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            pass

    # ── NEW ARCHITECTURE: Permanent patient files + hospitalizations ──────
    c.executescript("""
        CREATE TABLE IF NOT EXISTS dossiers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            prenom TEXT NOT NULL,
            date_naissance TEXT,
            sexe TEXT DEFAULT 'M',
            nom_pere TEXT,
            nom_mere TEXT,
            telephone TEXT,
            groupe_sanguin TEXT,
            rhesus TEXT DEFAULT 'positif',
            groupe_abo TEXT,
            phenotype TEXT,
            allergies_permanentes TEXT DEFAULT '[]',
            antecedents_chroniques TEXT DEFAULT '',
            vaccinations TEXT DEFAULT '[]',
            vaccination_status TEXT DEFAULT 'inconnu',
            notes_permanentes TEXT DEFAULT '',
            createdat TEXT DEFAULT (datetime('now')),
            created_by TEXT
        );
        CREATE TABLE IF NOT EXISTS sejours (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dossier_id INTEGER NOT NULL REFERENCES dossiers(id),
            patient_id_legacy INTEGER,
            date_entree TEXT DEFAULT (date('now')),
            date_sortie TEXT,
            poids_admission TEXT,
            taille_admission REAL,
            pc_cranien REAL,
            poids_naissance REAL,
            poids_ref TEXT,
            diagnostic_entree TEXT NOT NULL,
            diagnostic_sortie TEXT,
            roomid INTEGER REFERENCES rooms(id),
            bed INTEGER DEFAULT 1,
            etat TEXT DEFAULT 'admis',
            type_sortie TEXT,
            transfert_destination TEXT,
            resume_clinique TEXT,
            traitement_sortie TEXT,
            consignes_parents TEXT,
            medecin_sortie TEXT,
            tuteur_nom TEXT,
            tuteur_telephone TEXT,
            tuteur_relation TEXT DEFAULT 'Parent',
            createdat TEXT DEFAULT (datetime('now')),
            created_by TEXT,
            updatedat TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS comptes_rendus_sortie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sejour_id INTEGER NOT NULL REFERENCES sejours(id),
            dossier_id INTEGER NOT NULL REFERENCES dossiers(id),
            date_redaction TEXT DEFAULT (datetime('now')),
            medecin_redacteur TEXT NOT NULL,
            diagnostic_principal TEXT,
            resume_sejour TEXT,
            traitement_sortie TEXT,
            ordonnance_sortie TEXT,
            consignes TEXT,
            rdv_controle TEXT,
            type_sortie TEXT,
            scam_signature BOOLEAN DEFAULT 0,
            createdat TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS prescription_validation (
            patient_id INTEGER PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'approved',
            reviewer TEXT,
            note TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS drug_interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drug_a TEXT NOT NULL,
            drug_b TEXT NOT NULL,
            severity TEXT NOT NULL,
            consequence TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notification_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            message TEXT,
            status TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS firmware_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT,
            filename TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source TEXT,
            topic TEXT,
            payload TEXT
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT NOT NULL,
            actor_role TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id INTEGER,
            detail TEXT,
            timestamp TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS ordonnances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            prescripteur_id TEXT,
            date_creation TEXT DEFAULT (datetime('now')),
            date_modification TEXT,
            statut TEXT DEFAULT 'active',
            notes TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS lignes_ordonnance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ordonnance_id INTEGER NOT NULL REFERENCES ordonnances(id) ON DELETE CASCADE,
            medicament_id INTEGER REFERENCES medications(id),
            medicament_libre TEXT,
            dose_mg REAL,
            dose_ml REAL,
            nb_prises_par_jour INTEGER DEFAULT 1,
            duree_jours INTEGER DEFAULT 1,
            moment_prise TEXT DEFAULT 'apres_repas',
            distributed_by_robot INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS patient_current_treatments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            med_name    TEXT NOT NULL,
            dose        TEXT NOT NULL DEFAULT '',
            frequency   TEXT NOT NULL DEFAULT '',
            route       TEXT DEFAULT '',
            start_date  TEXT DEFAULT (date('now')),
            end_date    TEXT,
            origin      TEXT DEFAULT 'Hospitalisation',
            notes       TEXT DEFAULT '',
            active      INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS pharmacy_stock_lots (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_id       INTEGER NOT NULL
                           REFERENCES pharmacy_stock(id) ON DELETE CASCADE,
            lot_number     TEXT NOT NULL,
            expiry_date    TEXT NOT NULL,
            quantity       INTEGER NOT NULL DEFAULT 0,
            reception_date TEXT DEFAULT (date('now')),
            supplier       TEXT DEFAULT '',
            notes          TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS vitals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
            temperature REAL,
            respiratory_rate INTEGER,
            spo2 INTEGER,
            diuresis TEXT,
            transit TEXT,
            glasgow INTEGER,
            recorded_by TEXT,
            shift TEXT,
            timestamp TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS staff_requests (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            fullname     TEXT NOT NULL,
            username     TEXT NOT NULL UNIQUE,
            passwordhash TEXT NOT NULL,
            role         TEXT NOT NULL DEFAULT 'MEDECIN_RESIDENT',
            phone        TEXT,
            note         TEXT,
            rfiduid      TEXT,
            pin          TEXT,
            status       TEXT NOT NULL DEFAULT 'PENDING',
            createdat    TEXT DEFAULT (datetime('now')),
            validatedat  TEXT,
            validatedby  TEXT
        );
    """)
    conn.commit()

    # ── Seed rooms ─────────────────────────────────────────────────
    if c.execute("SELECT COUNT(*) FROM rooms").fetchone()[0] == 0:
        for i in range(1, 11):
            c.execute("INSERT OR IGNORE INTO rooms(id,name) VALUES (?,?)",
                      (i, f"Salle {str(i).zfill(2)}"))

    # ── Migration: Add username and passwordhash columns if they don't exist ──
    try:
        c.execute("ALTER TABLE doctors ADD COLUMN username TEXT DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists

    try:
        c.execute("ALTER TABLE doctors ADD COLUMN password_hash TEXT DEFAULT ''")
        conn.commit()
    except Exception:
        pass  # Column already exists

    # ── Enforce single-doctor model: Delete all doctors and seed only Dr. KARA Abderraouf ──
    # Delete all existing doctors
    c.execute("DELETE FROM doctors")

    # Insert the single allowed doctor
    ph = pwd_context.hash("kara1235")  # Hash the password
    c.execute(
        """INSERT INTO doctors(
            rfid_uid, name, role, pin, pin_hash,
            username, password_hash, can_prescribe, role_code, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "3E487B89",                    # rfid_uid
            "Dr. KARA Abderraouf",         # name
            "Médecin Chef Pédiatrie",      # role
            "1234",                        # pin
            ph,                            # pin_hash
            "kara",                        # username
            ph,                            # password_hash (same as pin_hash for simplicity)
            1,                             # can_prescribe
            "medecin",                     # role_code
            "ACTIVE"                       # status
        ),
    )

    # Ensure uniqueness constraints via triggers or application logic
    # SQLite doesn't support adding UNIQUE constraints easily after table creation,
    # so we'll enforce uniqueness in the API layer

    conn.commit()

    # ── Seed patients ──────────────────────────────────────────────
    seed_patients = [
        ("Yanis", "Belkacem", 6, "21kg", "A+", "Pneumonie", 1, 1, "[]", "2020-03-15", "A", "positif", 1, 0, 0, 1, 0, 0, "[]", "[]", "", ""),
        ("Sami", "Haddad", 5, "19kg", "O-", "Bronchiolite", 1, 2, '[{"medication":"Arachides"}]', "2021-06-10", "O", "negatif", 0, 0, 0, 0, 0, 0, "[]", '["Arachides"]', "", ""),
        ("Lina", "Mansouri", 4, "16kg", "B+", "Gastro-entérite", 2, 1, '[{"medication":"Pénicilline"},{"medication":"Arachides"}]', "2022-01-22", "B", "positif", 0, 1, 0, 0, 1, 0, '["Pénicilline"]', '["Arachides"]', "", ""),
        ("Inès", "Haddad", 3, "14kg", "A-", "Suivi Chirurgical", 2, 2, "[]", "2022-09-08", "A", "negatif", 0, 0, 0, 0, 0, 0, "[]", "[]", "", ""),
        ("Amine", "Zerrouki", 8, "28kg", "AB+", "Fracture Tibia", 3, 1, "[]", "2018-04-03", "AB", "positif", 0, 0, 0, 0, 0, 0, "[]", "[]", "", ""),
        ("Sarah", "Benali", 7, "24kg", "O+", "Observation", 3, 2, "[]", "2019-07-19", "O", "positif", 0, 0, 0, 0, 0, 0, "[]", "[]", "", ""),
        ("Amine", "Mansouri", 6, "22kg", "O+", "Pneumonie infectieuse", 4, 1, '[{"medication":"Pénicilline"}]', "2020-01-10", "O", "positif", 0, 0, 0, 0, 0, 0, '["Pénicilline"]', "[]", "", ""),
        ("Yasmine", "Kaci", 5, "18kg", "A+", "Angine", 4, 2, "[]", "2021-04-25", "A", "positif", 0, 0, 0, 0, 0, 0, "[]", "[]", "", ""),
        ("Mehdi", "Brahimi", 9, "30kg", "B-", "Observation", 5, 1, "[]", "2017-02-14", "B", "negatif", 0, 0, 0, 0, 0, 0, "[]", "[]", "", ""),
        ("Nour", "El Houda", 4, "15kg", "O+", "Observation", 5, 2, "[]", "2022-11-30", "O", "positif", 0, 0, 0, 0, 0, 0, "[]", "[]", "", ""),
    ]
    existing = c.execute("SELECT COUNT(*) FROM patients").fetchone()[0]
    if existing == 0:
        ins_pat = """INSERT INTO patients(
            first_name,last_name,age,weight,blood_type,diagnostic,room_id,bed,allergies,notes,
            date_naissance,groupe_sanguin,groupe_abo,rhesus,ph_C,ph_c,ph_E,ph_e,ph_K,ph_k,
            antecedents,traitement_en_cours,drug_allergies,other_allergies
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
        for p in seed_patients:
            fn, ln, age, w, bt, diag, rid, bed, allj, dn, ga, rh, pC, pc, pE, pe, pK, pk, drug_j, oth_j, ant, te = p
            gs = bt
            c.execute(
                ins_pat,
                (
                    fn,
                    ln,
                    age,
                    w,
                    bt,
                    diag,
                    rid,
                    bed,
                    allj,
                    "",
                    dn,
                    gs,
                    ga,
                    rh,
                    pC,
                    pc,
                    pE,
                    pe,
                    pK,
                    pk,
                    ant,
                    te,
                    drug_j,
                    oth_j,
                ),
            )
        guardians_seed = [
            (1,"Ahmed Belkacem","213 550 12 34 56","Père"),
            (2,"Leila Haddad","213 551 22 33 44","Mère"),
            (3,"Sofia Mansouri","213 661 98 76 54","Mère"),
            (4,"Leila Haddad","213 552 00 11 22","Grand-mère"),
            (5,"Karim Zerrouki","213 770 44 33 22","Père"),
            (6,"Mme. Benali","213 555 11 22 33","Mère"),
            (7,"Karim Mansouri","0550 12 34 56","Père"),
            (8,"M. Kaci","213 555 44 55 66","Père"),
            (9,"Mme. Brahimi","213 555 00 11 22","Mère"),
            (10,"Mme. El Houda","213 555 33 44 55","Mère"),
        ]
        for g in guardians_seed:
            c.execute("INSERT INTO guardians(patient_id,name,phone,relationship) VALUES (?,?,?,?)", g)
        conn.commit()

    # ── Catalogue médicaments / consommables (medicine.json) ou seed minimal ──
    # Ne pas réimporter à chaque démarrage (efface meds/stock) : seulement si table vide ou FORCE_MEDICINE_JSON_IMPORT=1
    _mj = os.getenv("MEDICINE_JSON", "").strip()
    catalog_path = (
        Path(_mj)
        if _mj
        else Path("C:/ROBOT_MED/backend/medicine.json")
        if Path("C:/ROBOT_MED/backend/medicine.json").is_file()
        else Path(__file__).resolve().parent.parent / "medicine.json"
    )
    med_count = c.execute("SELECT COUNT(*) FROM medications").fetchone()[0]
    _force_cat = os.getenv("FORCE_MEDICINE_JSON_IMPORT", "").strip().lower() in ("1", "true", "yes")
    if catalog_path.is_file() and (med_count == 0 or _force_cat):
        n_items = seed.import_medicine_catalog_from_json(c, str(catalog_path))
        print(f"[init_db] medicine.json : {n_items} lignes (médicaments + consommables).")
    elif med_count == 0:
        meds = [
            ("Amoxicilline", "500mg", "Matin", 1, "08:00"),
            ("Paracétamol Sirop", "7.5ml", "Toutes les 6h", 2, "12:00"),
            ("Ventoline", "2 bouffées", "Si besoin", 3, "06:45"),
            ("Vitamine D", "1 dose", "Matin", 4, "09:00"),
            ("Sérum Phy", "Lavage nasal", "3x/jour", 5, "14:00"),
            ("Gaviscon", "Après repas", "Soir", 6, "20:00"),
        ]
        for m in meds:
            if c.execute("SELECT COUNT(*) FROM medications").fetchone()[0] == 0:
                c.execute(
                    "INSERT OR IGNORE INTO medications(name,dosage,schedule,drawer,time) VALUES (?,?,?,?,?)",
                    m,
                )
        existing_stock = c.execute("SELECT COUNT(*) FROM pharmacy_stock").fetchone()[0]
        if existing_stock == 0:
            stock_seed = [
                ("Amoxicilline", "500mg", "gélules", 120, 20, "2026-12-31", 1, "Tiroir 1"),
                ("Paracétamol", "250mg", "comprimés", 200, 30, "2026-09-15", 2, "Tiroir 2"),
                ("Ibuprofène", "200mg", "comprimés", 80, 20, "2027-03-10", 3, "Tiroir 3"),
                ("Amoxicilline", "125mg/5ml", "flacon", 15, 5, "2026-06-30", 4, "Tiroir 4"),
                ("Cétirizine", "10mg", "comprimés", 60, 15, "2027-01-20", 5, "Tiroir 5"),
                ("Salbutamol", "100µg", "aérosol", 25, 5, "2026-08-01", 6, "Tiroir 6"),
            ]
            for s in stock_seed:
                c.execute(
                    "INSERT INTO pharmacy_stock(name,dosage,unit,quantity,min_stock,expiry_date,drawer,location) VALUES (?,?,?,?,?,?,?,?)",
                    s,
                )
        try:
            c.execute(
                "UPDATE pharmacy_stock SET pediatric_mg_per_kg=40 WHERE drawer=1 AND pediatric_mg_per_kg IS NULL"
            )
            c.execute(
                "UPDATE pharmacy_stock SET pediatric_mg_per_kg=15 WHERE drawer=2 AND pediatric_mg_per_kg IS NULL"
            )
            c.execute(
                "UPDATE pharmacy_stock SET pediatric_mg_per_kg=35 WHERE drawer=4 AND pediatric_mg_per_kg IS NULL"
            )
        except Exception:
            pass
        seed.seed_demo_prescriptions(c)

    try:
        c.execute(
            "UPDATE medications SET is_high_risk=1 WHERE lower(name) LIKE '%morphine%' OR lower(name) LIKE '%insulin%' OR lower(name) LIKE '%warfar%'"
        )
    except Exception:
        pass

    di_count = c.execute("SELECT COUNT(*) FROM drug_interactions").fetchone()[0]
    if di_count == 0:
        seed_di = [
            ("Amoxicilline", "Warfarine", "contre_indiquee", "Risque hémorragique augmenté"),
            ("Paracétamol", "Morphine", "deconseillee", "Dépression du système nerveux central"),
            ("Ibuprofène", "Aspirine", "deconseillee", "Augmentation du risque gastrique"),
            ("Insuline", "Metformine", "precaution", "Risque d'hypoglycémie"),
        ]
        for a, b, sev, cons in seed_di:
            if c.execute("SELECT COUNT(*) FROM drug_interactions").fetchone()[0] == 0:
                c.execute(
                    "INSERT INTO drug_interactions(drug_a,drug_b,severity,consequence) VALUES (?,?,?,?)",
                    (a, b, sev, cons),
                )

    try:
        c.execute(
            "INSERT OR IGNORE INTO prescription_validation(patient_id,status) SELECT id,'approved' FROM patients"
        )
    except Exception:
        pass

    try:
        c.execute(
            "UPDATE patients SET groupe_sanguin = blood_type WHERE groupe_sanguin IS NULL OR groupe_sanguin = ''"
        )
    except Exception:
        pass

    try:
        seed._backfill_patient_demographics(c)
    except Exception as ex:
        print(f"[init_db] backfill patients: {ex}")
    try:
        seed._seed_patient_demo_treatments(c)
    except Exception as ex:
        print(f"[init_db] seed traitements: {ex}")
    try:
        seed._seed_demo_rooms(c)
    except Exception as ex:
        print(f"[init_db] seed rooms: {ex}")
    try:
        seed._seed_demo_pharmacy_stock(c)
    except Exception as ex:
        print(f"[init_db] seed pharmacy_stock: {ex}")
    try:
        seed._seed_demo_audit_log(c)
    except Exception as ex:
        print(f"[init_db] seed audit_log: {ex}")
    # Disabled: demo dispense_log entries cause confusion in analytics
    # try:
    #     seed._seed_demo_dispenselog(c)
    # except Exception as ex:
    #     print(f"[init_db] seed dispenselog: {ex}")

    med_meta = [
        (1, "Antibiotique", "LOT-AMX-2026-01", "500mg", 100.0, 500.0, 1),
        (2, "Antalgique", "LOT-PAR-2025-88", "250mg/5ml", 5.0, 250.0, 1),
        (3, "Bronchodilatateur", "LOT-VENT-24", "100µg/dose", None, None, 1),
        (4, "Vitamine", "LOT-VD-2026", "1 dose", 2.0, 400.0, 1),
        (5, "Hygiène nasale", "LOT-PHY-2026", "5ml", 5.0, 5.0, 1),
        (6, "Gastro", "LOT-GAV-2025", "suspension", 10.0, 200.0, 0),
    ]
    for mid, cl, lot, conc, vol, d_amp, dist in med_meta:
        try:
            c.execute(
                """UPDATE medications SET classe_therapeutique=?, numero_lot=?, concentration=?,
                   volume_ampoule_ml=?, dose_ampoule_mg=?, distributed_by_robot=? WHERE id=?""",
                (cl, lot, conc, vol, d_amp, dist, mid),
            )
        except Exception:
            pass

    for dr in range(1, 10):
        try:
            mrow = c.execute("SELECT classe_therapeutique, numero_lot, concentration, volume_ampoule_ml, dose_ampoule_mg, distributed_by_robot FROM medications WHERE drawer=?", (dr,)).fetchone()
            if mrow:
                mr = dict(mrow)
                c.execute(
                    """UPDATE pharmacy_stock SET classe_therapeutique=?, numero_lot=?, concentration=?,
                       volume_ampoule_ml=?, dose_ampoule_mg=?, distributed_by_robot=? WHERE drawer=?""",
                    (
                        mr.get("classe_therapeutique"),
                        mr.get("numero_lot"),
                        mr.get("concentration"),
                        mr.get("volume_ampoule_ml"),
                        mr.get("dose_ampoule_mg"),
                        mr.get("distributed_by_robot"),
                        dr,
                    ),
                )
        except Exception:
            pass

    _ensure_pin_hashes(conn)
    _migrate_doctor_roles_to_new_format(conn)
    seed._seed_default_admin(conn)
    _migrate_prescriptions_to_ordonnances(conn)

    # ── Create indexes for frequently queried columns ──────────────
    index_statements = [
        "CREATE INDEX IF NOT EXISTS idx_vitals_patient_id ON vitals(patient_id)",
        "CREATE INDEX IF NOT EXISTS idx_dispense_log_patient_id ON dispense_log(patient_id)",
        "CREATE INDEX IF NOT EXISTS idx_dispense_log_timestamp ON dispense_log(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_patients_room_id ON patients(room_id)",
        "CREATE INDEX IF NOT EXISTS idx_patients_dossier_id ON patients(dossier_id)",
        "CREATE INDEX IF NOT EXISTS idx_sejours_dossier_id ON sejours(dossier_id)",
        "CREATE INDEX IF NOT EXISTS idx_sejours_date_entree ON sejours(date_entree)",
        "CREATE INDEX IF NOT EXISTS idx_dossiers_nom_prenom ON dossiers(nom, prenom)",
        "CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id)",
        "CREATE INDEX IF NOT EXISTS idx_guardians_patient_id ON guardians(patient_id)",
    ]
    for idx_sql in index_statements:
        try:
            conn.execute(idx_sql)
        except Exception:
            pass  # Index might already exist

    conn.commit()
    conn.close()
