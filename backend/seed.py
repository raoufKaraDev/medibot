"""Demo data seeding and medicine catalog import."""
import json

from helpers import _split_blood_type_code, calc_dose_ml, hash_password


def seed_demo_prescriptions(cursor) -> None:
    """Lie les 6 premiers médicaments aux patients 1–3 (démo), si présents."""
    n = cursor.execute("SELECT COUNT(*) FROM medications").fetchone()[0]
    if n == 0:
        return
    for pid in (1, 2, 3):
        if cursor.execute("SELECT 1 FROM patients WHERE id=?", (pid,)).fetchone():
            for mid in range(1, min(7, n + 1)):
                cursor.execute(
                    "INSERT OR IGNORE INTO prescriptions(patient_id,medication_id) VALUES (?,?)",
                    (pid, mid),
                )


def _backfill_patient_demographics(cursor) -> None:
    """Complète date de naissance et groupe ABO/Rh pour les patients démo (ids 1–10) si champs vides."""
    rows = [
        (1, "2020-03-15", "A", "positif"),
        (2, "2021-06-10", "O", "negatif"),
        (3, "2022-01-22", "B", "positif"),
        (4, "2022-09-08", "A", "negatif"),
        (5, "2018-04-03", "AB", "positif"),
        (6, "2019-07-19", "O", "positif"),
        (7, "2020-01-10", "O", "positif"),
        (8, "2021-04-25", "A", "positif"),
        (9, "2017-02-14", "B", "negatif"),
        (10, "2022-11-30", "O", "positif"),
    ]
    for pid, dn, ga, rh in rows:
        try:
            cursor.execute(
                """UPDATE patients SET
                    date_naissance = CASE WHEN date_naissance IS NULL OR trim(date_naissance)='' THEN ? ELSE date_naissance END,
                    groupe_abo = CASE WHEN groupe_abo IS NULL OR trim(groupe_abo)='' THEN ? ELSE groupe_abo END,
                    rhesus = CASE WHEN rhesus IS NULL OR trim(rhesus)='' THEN ? ELSE rhesus END
                   WHERE id=?""",
                (dn, ga, rh, pid),
            )
        except Exception:
            pass
    for prow in cursor.execute("SELECT id, blood_type, groupe_abo FROM patients").fetchall():
        d = dict(prow)
        if (d.get("groupe_abo") or "").strip():
            continue
        abo, rh = _split_blood_type_code(d.get("blood_type") or "")
        if abo:
            try:
                cursor.execute(
                    "UPDATE patients SET groupe_abo=?, rhesus=? WHERE id=?",
                    (abo, rh, d["id"]),
                )
            except Exception:
                pass


def _seed_patient_demo_treatments(cursor) -> None:
    if cursor.execute("SELECT COUNT(*) FROM patient_current_treatments WHERE patient_id=1").fetchone()[0]:
        return
    if not cursor.execute("SELECT 1 FROM patients WHERE id=1").fetchone():
        return
    try:
        cursor.executescript(
            """INSERT INTO patient_current_treatments(patient_id,med_name,dose,frequency,route,origin,notes,active)
               VALUES (1,'Amoxicilline','500mg','3x/jour','Per os','Hospitalisation','',1);
               INSERT INTO patient_current_treatments(patient_id,med_name,dose,frequency,route,origin,notes,active)
               VALUES (1,'Paracétamol','250mg','Si fièvre > 38.5°C','Per os','Domicile','Traitement antérieur',1);"""
        )
    except Exception:
        pass


def _seed_default_admin(conn) -> None:
    """Crée le compte Médecin Chef par défaut si aucun doctor avec rfid_uid='3E487B89' n'existe."""
    c = conn.cursor()
    existing = c.execute("SELECT id FROM doctors WHERE rfid_uid=?", ("3E487B89",)).fetchone()
    if existing:
        return
    try:
        ph = __import__('passlib.context', fromlist=['CryptContext']).CryptContext(schemes=["bcrypt"], deprecated="auto").hash("1234")
        c.execute(
            """INSERT INTO doctors(name, role, rfid_uid, pin, pin_hash, username, passwordhash, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "Dr. KARA Abderraouf",
                "CHEF_SERVICE",
                "3E487B89",
                "1234",
                ph,
                "kara",
                hash_password("kara1235"),
                "ACTIVE",
            ),
        )
        conn.commit()
    except Exception as e:
        print(f"[seed_default_admin] {e}")


def import_medicine_catalog_from_json(cursor, path: str) -> int:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    meds = data.get("medications") or []
    cons = data.get("consumables") or []
    cursor.execute("DELETE FROM prescriptions")
    cursor.execute("DELETE FROM medications")
    cursor.execute("DELETE FROM pharmacy_stock")
    drawer = 0
    count = 0

    def next_drawer() -> int:
        nonlocal drawer
        drawer += 1
        return drawer

    for item in meds:
        d = next_drawer()
        label = (item.get("name") or item.get("generic_name") or "Inconnu").strip()
        dosage = (item.get("dosage") or "-").strip()
        unit = (item.get("unit") or "ampoule").strip().lower()
        is_hr = 1 if item.get("is_high_risk") else 0
        qty = int(item.get("quantity") or item.get("stock") or 0)
        mn = int(item.get("min_stock") or 10)
        mx = int(item.get("max_stock") or mn * 5)
        th_class = (item.get("therapeutic_class") or item.get("category") or "").strip()
        comm_name = (item.get("commercial_name") or "").strip()
        dosage_form = (item.get("dosage_form") or item.get("form") or "").strip()
        storage = (item.get("storage_condition") or "Température ambiante").strip()
        req_prep = 1 if item.get("requires_preparation") else 0
        is_psych = 1 if item.get("is_psychotropic") else 0
        is_cold = 1 if item.get("is_cold_chain") else 0
        is_restr = 1 if item.get("is_restricted_pediatric") else 0
        supplier = (item.get("supplier") or "").strip()
        barcode = (item.get("barcode") or "").strip()
        lot = (item.get("lot_number") or "").strip()
        rec_date = (item.get("reception_date") or "").strip()
        expiry = (item.get("expiry_date") or "2027-12-31").strip()
        ped = item.get("pediatric_mg_per_kg")
        notes = (item.get("notes") or "").strip()
        loc = th_class or "Pharmacie"

        cursor.execute(
            """INSERT INTO medications(name,dosage,schedule,drawer,time,is_high_risk)
               VALUES (?,?,?,?,?,?)""",
            (label, dosage, "Hospitalisation", d, "", is_hr),
        )
        cursor.execute(
            """INSERT INTO pharmacy_stock(
                 name,dosage,unit,quantity,min_stock,max_stock,
                 expiry_date,drawer,location,pediatric_mg_per_kg,
                 therapeutic_class,commercial_name,dosage_form,
                 storage_condition,requires_preparation,is_psychotropic,
                 is_cold_chain,is_restricted_pediatric,supplier,barcode,
                 lot_number,reception_date,notes,is_high_risk
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                label,
                dosage,
                unit,
                qty,
                mn,
                mx,
                expiry,
                d,
                loc,
                ped,
                th_class,
                comm_name,
                dosage_form,
                storage,
                req_prep,
                is_psych,
                is_cold,
                is_restr,
                supplier,
                barcode,
                lot,
                rec_date,
                notes,
                is_hr,
            ),
        )
        count += 1

    for item in cons:
        d = next_drawer()
        name = (item.get("name") or "Consommable").strip()
        cat = (item.get("category") or "Consommable / Dispositif").strip()
        qty = int(item.get("quantity") or item.get("stock") or 0)
        mn = int(item.get("min_stock") or 5)
        cursor.execute(
            """INSERT INTO medications(name,dosage,schedule,drawer,time,is_high_risk)
               VALUES (?,?,?,?,?,?)""",
            (name, "-", "Consommable / dispositif", d, "", 0),
        )
        cursor.execute(
            """INSERT INTO pharmacy_stock(
                 name,dosage,unit,quantity,min_stock,max_stock,expiry_date,
                 drawer,location,therapeutic_class,dosage_form,storage_condition
               ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                name,
                "-",
                "pièce",
                qty,
                mn,
                mn * 5,
                "2099-12-31",
                d,
                cat,
                "Pansement / Dispositif médical",
                "Dispositif médical",
                "Température ambiante",
            ),
        )
        count += 1

    seed_demo_prescriptions(cursor)
    return count


def _seed_demo_pharmacy_stock(cursor) -> None:
    """Ajoute 4+ médicaments démo à pharmacy_stock."""
    
    # Only seed if pharmacy_stock demo data is empty (check for "DEMO" items)
    demo_count = cursor.execute("SELECT COUNT(*) FROM pharmacy_stock WHERE name LIKE '%DEMO%'").fetchone()[0]
    if demo_count > 0:
        return
    
    stock_seed = [
        # (name, dosage, unit, quantity, min_stock, max_stock, expiry_date, drawer, 
        #  location, therapeutic_class, commercial_name, dosage_form, storage_condition,
        #  requires_preparation, is_psychotropic, is_cold_chain, is_restricted_pediatric, 
        #  supplier, barcode, lot_number, reception_date, notes, is_high_risk, maxdosemg24h)
        (
            "Paracétamol DEMO", "30.0", "mg/ml", 48, 10, 50, "2027-12-31", 101,
            "Pharmacie", "Antalgique / Antipyrétique", "Doliprane DEMO", "sirop", "Température ambiante",
            0, 0, 0, 0, "Sanofi", "3400000000000", "LOT-PAR-2026-01", "2026-01-15", "Douleur/Fièvre", 0, 60.0
        ),
        (
            "Ibuprofène DEMO", "200.0", "mg", 30, 5, 50, "2027-09-15", 102,
            "Pharmacie", "Anti-inflammatoire (AINS)", "Advil DEMO", "comprimé", "Température ambiante",
            0, 0, 0, 0, "Ménarini", "3400000000001", "LOT-IBU-2026-02", "2026-01-20", "Douleur/Inflammation", 0, 40.0
        ),
        (
            "Amoxicilline DEMO", "250.0", "mg/5ml", 20, 5, 40, "2027-06-30", 103,
            "Pharmacie", "Antibiotique — Pénicillines", "Clamoxyl DEMO", "poudre", "Température ambiante",
            1, 0, 0, 0, "GSK", "3400000000002", "LOT-AMX-2026-03", "2026-02-01", "Infection bactérienne", 0, 90.0
        ),
        (
            "Salbutamol DEMO", "100.0", "mcg", 15, 3, 30, "2027-03-15", 104,
            "Pharmacie", "Bronchodilatateur", "Ventoline DEMO", "aérosol", "Température ambiante",
            0, 0, 0, 0, "GSK", "3400000000003", "LOT-SAL-2026-04", "2026-02-10", "Crise asthme", 0, 400.0
        ),
    ]
    
    for item in stock_seed:
        (name, dosage, unit, qty, mn, mx, expiry, drawer, loc, th_class, 
         comm_name, dosage_form, storage, req_prep, is_psych, is_cold, is_restr, 
         supplier, barcode, lot, rec_date, notes, is_hr, maxdose) = item
        try:
            cursor.execute(
                """INSERT INTO pharmacy_stock(
                     name, dosage, unit, quantity, min_stock, max_stock,
                     expiry_date, drawer, location, therapeutic_class, commercial_name,
                     dosage_form, storage_condition, requires_preparation, is_psychotropic,
                     is_cold_chain, is_restricted_pediatric, supplier, barcode,
                     lot_number, reception_date, notes, is_high_risk, maxdosemg24h
                   ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (name, dosage, unit, qty, mn, mx, expiry, drawer, loc, th_class,
                 comm_name, dosage_form, storage, req_prep, is_psych, is_cold, is_restr,
                 supplier, barcode, lot, rec_date, notes, is_hr, maxdose),
            )
        except Exception as e:
            print(f"[_seed_demo_pharmacy_stock] {e}")


def _seed_demo_dispenselog(cursor) -> None:
    """Ajoute 5+ enregistrements démo à dispense_log."""
    
    # Only seed if demo dispense_log entries don't already exist (check for "DEMO" in med_name)
    dispense_count = cursor.execute("SELECT COUNT(*) FROM dispense_log WHERE med_name LIKE '%DEMO%'").fetchone()[0]
    if dispense_count > 0:
        return
    
    # Vérifier que les patients existent
    patients_exist = cursor.execute("SELECT COUNT(*) FROM patients WHERE id IN (1, 2, 3)").fetchone()[0]
    if patients_exist < 3:
        return
    
    log_seed = [
        # (patient_id, med_name, drawer, doctor, timestamp, note)
        (1, "Paracétamol DEMO", 101, "Dr. KARA", "2026-04-18 08:30:00", "Dose standard"),
        (2, "Amoxicilline DEMO", 103, "Dr. KARA", "2026-04-18 09:15:00", "Infection confirmée"),
        (1, "Ibuprofène DEMO", 102, "Dr. KARA", "2026-04-18 10:00:00", "Anti-inflammatoire"),
        (3, "Salbutamol DEMO", 104, "Dr. KARA", "2026-04-18 14:30:00", "Crise asthme légère"),
        (2, "Paracétamol DEMO", 101, "Dr. KARA", "2026-04-19 08:00:00", "Suivi fièvre"),
    ]
    
    for patient_id, med_name, drawer, doctor, timestamp, note in log_seed:
        try:
            cursor.execute(
                """INSERT INTO dispense_log(
                     patient_id, med_name, drawer, doctor, timestamp, note
                   ) VALUES (?,?,?,?,?,?)""",
                (patient_id, med_name, drawer, doctor, timestamp, note),
            )
        except Exception as e:
            print(f"[_seed_demo_dispenselog] {e}")


def _seed_demo_audit_log(cursor) -> None:
    """Add demo audit log entries for testing dashboard KPIs."""
    # Check if demo audit entries already exist
    count = cursor.execute("SELECT COUNT(*) FROM audit_log WHERE actor LIKE '%DEMO%' OR detail LIKE '%DEMO%'").fetchone()[0]
    if count > 0:
        return
    
    today = "2026-04-20"
    audit_entries = [
        # (actor, actor_role, action, target_type, target_id, detail, timestamp)
        ("Dr. KARA", "Médecin Chef Pédiatrie", "LOGIN", "", 0, "Connexion système", f"{today} 07:30:00"),
        ("Système", "Infirmiere", "CREATE_PATIENT", "patient", 1, "DEMO - Patient Yanis ajouté Salle 1 Lit 1", f"{today} 08:00:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "DISPENSE", "medication", 1, "Paracétamol → Tiroir 101", f"{today} 08:15:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "DISPENSE", "medication", 2, "Amoxicilline → Tiroir 103", f"{today} 08:45:00"),
        ("Infirmiere", "Infirmiere", "EDIT_PATIENT", "patient", 1, "DEMO - Modification dossier patient", f"{today} 09:30:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "DISPENSE", "medication", 1, "Ibuprofène → Tiroir 102 (Haut Risque)", f"{today} 10:00:00"),
        ("Système", "Robot", "FORCE_OVERRIDE", "drawer", 5, "DEMO - Forçage d'ouverture - Maintenance", f"{today} 11:15:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "DISPENSE", "medication", 3, "Salbutamol → Tiroir 104", f"{today} 12:30:00"),
        ("Infirmiere", "Infirmiere", "LOGIN_FAILED", "", 0, "Tentative de connexion - mauvais PIN", f"{today} 13:45:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "VALIDATE_PRESCRIPTION", "prescription", 1, "DEMO - Validation ordonnance patient", f"{today} 14:00:00"),
        ("Système", "Infirmiere", "CREATE_PATIENT", "patient", 2, "DEMO - Patient Amina ajoutée Salle 2 Lit 1", f"{today} 14:30:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "DISPENSE", "medication", 2, "Morphine → Tiroir 110 (Haut Risque)", f"{today} 15:15:00"),
        ("Admin", "Système", "DELETE_PATIENT", "patient", 5, "DEMO - Suppression dossier patient (test)", f"{today} 16:00:00"),
        ("Dr. KARA", "Médecin Chef Pédiatrie", "LOGIN", "", 0, "Déconnexion système", f"{today} 16:30:00"),
    ]
    
    for actor, actor_role, action, target_type, target_id, detail, timestamp in audit_entries:
        try:
            cursor.execute(
                """INSERT INTO audit_log(actor, actor_role, action, target_type, target_id, detail, timestamp)
                   VALUES (?,?,?,?,?,?,?)""",
                (actor, actor_role, action, target_type, target_id, detail, timestamp),
            )
        except Exception as e:
            print(f"[_seed_demo_audit_log] {e}")


def _seed_demo_rooms(cursor) -> None:
    """Ajoute 2+ chambres démo."""
    
    # Only add if rooms table is currently empty
    existing = cursor.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
    if existing > 0:
        return
    
    rooms_seed = [
        (1, "Chambre 1", 4),
        (2, "Chambre 2", 4),
    ]
    
    for room_id, name, capacity in rooms_seed:
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO rooms(id, name, capacity) VALUES (?,?,?)",
                (room_id, name, capacity),
            )
        except Exception as e:
            print(f"[_seed_demo_rooms] {e}")

