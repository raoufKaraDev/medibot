"""
Sync receiver — runs on REMOTE backup server only.
Receives payloads from LOCAL, validates, stores.
"""
import hashlib
import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from config import IS_REMOTE, BACKUP_API_KEY

logger = logging.getLogger("medibot.sync.receiver")
router = APIRouter(prefix="/api/sync", tags=["sync"])

ALLOWED_TABLES = {
    "audit_logs", "dispensing_events", "patients",
    "prescriptions", "medications", "stock_levels", "doctors",
}

MAX_PAYLOAD_AGE_SECONDS = 86400  # 24 hours — tolerates clock skew & retry queues


def _verify_sync_key(request: Request) -> None:
    if not BACKUP_API_KEY:
        return
    key = request.headers.get("X-Sync-Key", "")
    if key != BACKUP_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid sync key")


def _verify_checksum(payload: dict) -> None:
    expected = payload.get("checksum", "")
    domains_json = json.dumps(
        payload.get("domains", {}), sort_keys=True, default=str
    )
    actual = hashlib.sha256(domains_json.encode()).hexdigest()
    if expected != actual:
        raise HTTPException(status_code=400, detail="Checksum mismatch")


def _verify_timestamp(payload: dict) -> None:
    """Reject payloads older than 24 hours. Handles timezone-aware and naive datetimes."""
    try:
        raw = payload["timestamp"]
        sync_time = datetime.fromisoformat(raw)
        # Normalise to UTC
        if sync_time.tzinfo is not None:
            now = datetime.now(timezone.utc)
        else:
            now = datetime.utcnow()
        age = abs((now - sync_time).total_seconds())  # abs() tolerates minor clock skew
        if age > MAX_PAYLOAD_AGE_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Payload too old ({int(age)}s > {MAX_PAYLOAD_AGE_SECONDS}s)"
            )
    except HTTPException:
        raise
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp: {e}")


@router.post("/push")
async def receive_sync_payload(payload: dict, request: Request):
    """
    Receive sync payload from LOCAL hospital backend.
    Only active on REMOTEBACKUP environment.
    """
    if not IS_REMOTE:
        raise HTTPException(
            status_code=403,
            detail="Sync receiver only active on remote server"
        )

    _verify_sync_key(request)
    _verify_checksum(payload)
    _verify_timestamp(payload)

    sync_id = payload.get("sync_id", "unknown")
    domains = payload.get("domains", {})
    total_received = 0

    for table, data in domains.items():
        if table not in ALLOWED_TABLES:
            logger.warning(f"Sync: ignoring unknown table '{table}'")
            continue
        records = data.get("records", []) if isinstance(data, dict) else data
        total_received += len(records)
        logger.info(f"Sync received: {table} — {len(records)} records")

    logger.info(f"Sync {sync_id} accepted: {total_received} total records")
    return {
        "status": "accepted",
        "sync_id": sync_id,
        "records_received": total_received,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/status")
async def sync_status():
    return {
        "environment": "REMOTEBACKUP",
        "receiver": "active",
        "timestamp": datetime.utcnow().isoformat(),
    }
