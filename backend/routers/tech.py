import time

from fastapi import APIRouter, HTTPException, Request, Depends

from config import APP_START, MQTT_HOST, MQTT_PORT, MQTT_WS_PORT
from database import get_db, write_audit
from helpers import (
    calc_dose_ml,
    calc_pediatric_dose_mg,
    enrich_patient_dict,
    hash_password,
    infer_role_code,
    parse_weight_kg,
    pediatric_dose_hint,
    row_to_dict,
    rows_to_list,
    stock_with_status,
    _doctor_access_payload,
    _dump_patient_update,
    _dump_treatment_update,
    _ph_int,
    _pharmacy_patch,
    _allergies_to_json_for_db,
    _json_str_list_for_db,
)
from mqtt import TOPIC_CMD, get_mqtt, mqtt_publish, robot_state
from middleware import require_local_admin
from schemas import (
    DispenseRequest,
    DoctorCreate,
    DoctorUpdate,
    DrugInteractionCreate,
    DrugInteractionUpdate,
    FirmwareMeta,
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

router = APIRouter(dependencies=[Depends(require_local_admin)])

@router.get("/api/status")
def api_status():
    m = get_mqtt()
    broker_ok = bool(m and m.is_connected())
    return {
        "mqtt_broker": "online" if broker_ok else "offline",
        "esp32": robot_state.get("esp32", "unknown"),
        "stm32": robot_state.get("stm32", "unknown"),
        "last_rfid_scan": robot_state.get("last_rfid_scan"),
        "last_dispense": robot_state.get("last_dispense"),
        "uptime_seconds": int(time.time() - APP_START),
        "broker_host": MQTT_HOST,
        "broker_port": MQTT_PORT,
        "ws_port": MQTT_WS_PORT,
    }

# ══════════════════════════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════════════════════════

@router.post("/api/tech/firmware")
def upload_firmware_meta(data: FirmwareMeta):
    conn = None
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO firmware_history(version,filename) VALUES (?,?)",
            (data.version, data.filename),
        )
        conn.commit()
        rows = conn.execute("SELECT * FROM firmware_history ORDER BY id DESC LIMIT 5").fetchall()
        conn.close()
        return rows_to_list(rows)
    except Exception as e:
        print(f"[POST /api/tech/firmware] Error: {e}")
        if conn:
            conn.close()
        raise


@router.get("/api/tech/firmware-history")
def firmware_history():
    conn = get_db()
    rows = conn.execute("SELECT * FROM firmware_history ORDER BY id DESC LIMIT 10").fetchall()
    conn.close()
    return rows_to_list(rows)


@router.get("/api/tech/status")
def tech_status():
    import socket as _socket
    def port_open(host: str, port: int, timeout: float = 0.8) -> bool:
        try:
            with _socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    # TCP :1883 — use paho client (real broker connection state)
    m = get_mqtt()
    tcp_ok = m.is_connected()

    # WebSocket :9001 — TCP reachability (same host as MQTT broker)
    ws_ok = port_open(MQTT_HOST, MQTT_WS_PORT)

    conn = get_db()
    last = conn.execute("SELECT timestamp FROM dispense_log ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()

    rid = TOPIC_CMD.split("/")[1] if len(TOPIC_CMD.split("/")) > 1 else "ROBOT001"
    return {
        "mqtt_broker": "online" if tcp_ok else "offline",   # ← frontend TechStatus interface
        "mqtt_tcp":    "online" if tcp_ok else "offline",
        "broker_tcp":  "online" if tcp_ok else "offline",
        "tcp":         "online" if tcp_ok else "offline",
        "mqtt_ws":     "online" if ws_ok  else "offline",
        "broker_ws":   "online" if ws_ok  else "offline",
        "ws":          "online" if ws_ok  else "offline",
        "mqtt":        "online" if tcp_ok else "offline",
        "tcp_ok":      tcp_ok,
        "ws_ok":       ws_ok,
        "esp32":         robot_state.get("esp32", "unknown"),
        "stm32":         robot_state.get("stm32", "unknown"),
        "robot":         rid,
        "robot_id":      rid,
        "drawers":       6,
        "num_drawers":   6,
        "broker_host":   MQTT_HOST,
        "broker_port":   MQTT_PORT,
        "ws_port":       MQTT_WS_PORT,
        "last_activity": last["timestamp"] if last else None,
    }


@router.post("/api/tech/force-open")
def force_open_drawer(payload: dict):
    """Open a specific drawer without dispensing (maintenance/emergency)."""
    drawer = int(payload.get("drawer", 1))
    reason = str(payload.get("reason", "maintenance"))[:100]
    
    if not 1 <= drawer <= 20:
        raise HTTPException(status_code=400, detail="Numéro de tiroir invalide (1–20)")
    
    ok = mqtt_publish({
        "cmd": "open_drawer",
        "drawer": drawer,
        "forced": True,
        "reason": reason
    })
    
    conn = get_db()
    conn.execute(
        "INSERT INTO dispense_log(med_name, drawer, mqtt_sent, note) VALUES (?,?,?,?)",
        ("FORCE_OPEN", drawer, int(ok), f"Ouverture forcée: {reason}")
    )
    conn.commit()
    conn.close()
    
    return {"ok": ok, "drawer": drawer, "reason": reason}
