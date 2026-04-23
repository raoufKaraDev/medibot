from fastapi import APIRouter, HTTPException, Request
import time

from database import get_db, write_audit
from helpers import (
    row_to_dict,
    rows_to_list,
    stock_with_status,
)

from mqtt import TOPIC_CMD, get_mqtt, mqtt_publish, robot_state
from schemas import (
    DispenseRequest,
    GuardianCreate,
    GuardianUpdate,
    LogNote,
    LoginRequest,
    NotificationLogCreate,
    NotifyPatientBody,
    OrdonnanceCreate,
    PINRequest,
    PhotoUpload,
    PrescriptionCreate,
    PrescriptionDocCreate,
    PrescriptionValidationBody,
    PriseValiderBody,
    RFIDRequest,
    RestockRequest,
    PatientCreate,
    PatientTreatmentCreate,
    PatientTreatmentUpdate,
    PatientUpdate,
    PharmacyLotCreate,
    PharmacyStockCreate,
    PharmacyStockUpdate,
    WasteBody,
)

router = APIRouter()

@router.get("/api/stats")
def get_stats():
    conn = get_db()
    try:
        return {
            "total_patients":  conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0],
            "alert_patients":  conn.execute("SELECT COUNT(*) FROM patients WHERE (drug_allergies IS NOT NULL AND drug_allergies != '[]') OR (other_allergies IS NOT NULL AND other_allergies != '[]')").fetchone()[0],
            "total_doctors":   conn.execute("SELECT COUNT(*) FROM doctors").fetchone()[0],
            "dispenses_today": conn.execute("SELECT COUNT(*) FROM dispense_log WHERE date(timestamp)=date('now')").fetchone()[0],
            "total_dispenses": conn.execute("SELECT COUNT(*) FROM dispense_log").fetchone()[0],
            "rooms_occupied":  conn.execute("SELECT COUNT(DISTINCT room_id) FROM patients").fetchone()[0],
        }
    finally:
        conn.close()

# ══════════════════════════════════════════════════════════════════
# PHARMACY STOCK
# ══════════════════════════════════════════════════════════════════

@router.get("/api/analytics")
def analytics_summary(days: int = 14):
    from datetime import date, timedelta
    conn = get_db()
    start = (date.today() - timedelta(days=max(1, min(days, 90)))).isoformat()
    by_day = rows_to_list(
        conn.execute(
            """SELECT date(timestamp) AS d, COUNT(*) AS c FROM dispense_log
               WHERE date(timestamp) >= ? GROUP BY date(timestamp) ORDER BY d""",
            (start,),
        ).fetchall()
    )
    top_meds = rows_to_list(
        conn.execute(
            """SELECT med_name, COUNT(*) AS c FROM dispense_log
               WHERE date(timestamp) >= ? GROUP BY med_name ORDER BY c DESC LIMIT 5""",
            (start,),
        ).fetchall()
    )
    total = conn.execute(
        "SELECT COUNT(*) FROM dispense_log WHERE date(timestamp) >= ?", (start,)
    ).fetchone()[0]
    mqtt_ok = conn.execute(
        "SELECT COUNT(*) FROM dispense_log WHERE date(timestamp) >= ? AND mqtt_sent=1", (start,)
    ).fetchone()[0]
    conn.close()
    pct = round(100 * mqtt_ok / total, 1) if total else 100.0
    return {
        "dispenses_by_day": by_day,
        "top_medications": top_meds,
        "mqtt_success_pct": pct,
        "period_days": days,
    }


@router.get("/api/shift-report")
def shift_report(shift: str = "Matin"):
    conn = None
    try:
        # Validate shift parameter
        valid_shifts = ["Matin", "Apres-midi", "Nuit"]
        if shift not in valid_shifts:
            raise HTTPException(400, f"Shift invalide. Acceptés: {', '.join(valid_shifts)}")
        
        conn = get_db()
        
        # Count distributions today with null safety
        dist_result = conn.execute(
            "SELECT COUNT(*) FROM dispense_log WHERE date(timestamp)=date('now')"
        ).fetchone()
        dist_today = dist_result[0] if dist_result else 0
        
        # Get patients snapshot
        patients = rows_to_list(
            conn.execute("SELECT id, first_name, last_name, room_id, bed FROM patients").fetchall()
        )
        
        # Get dispense log for today
        log_today = rows_to_list(
            conn.execute(
                "SELECT * FROM dispense_log WHERE date(timestamp)=date('now') ORDER BY id DESC"
            ).fetchall()
        )
        
        # Get current date
        today = time.strftime("%Y-%m-%d")
        
        conn.close()
        return {
            "shift": shift,
            "date": today,
            "distributions_today": dist_today,
            "patients_snapshot": patients,
            "log_today": log_today,
        }
    except HTTPException:
        if conn:
            conn.close()
        raise
    except Exception as e:
        print(f"[GET /api/shift-report] Error: {e}")
        if conn:
            conn.close()
        raise HTTPException(500, f"Erreur lors de la récupération du rapport de shift: {str(e)}")

