"""
Sync receiver — runs on REMOTE backup server only.
Receives payloads from LOCAL, validates, and writes to SQLite.
"""
import hashlib
import json
import logging
import sqlite3
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from config import IS_REMOTE, BACKUP_API_KEY, DB_PATH

logger = logging.getLogger("medibot.sync.receiver")
router = APIRouter(prefix="/api/sync", tags=["sync"])

ALLOWED_TABLES = {
    "audit_log", "dispense_log", "patients",
    "prescriptions", "medications", "pharmacy_stock",
    "doctors", "rooms", "guardians", "dossiers", "sejours",
}

MAX_PAYLOAD_AGE_SECONDS = 86400  # 24h — tolerates clock skew & retry queues


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
    try:
        raw = payload["timestamp"]
        sync_time = datetime.fromisoformat(raw)
        if sync_time.tzinfo is not None:
            now = datetime.now(timezone.utc)
        else:
            now = datetime.utcnow()
        age = abs((now - sync_time).total_seconds())
        if age > MAX_PAYLOAD_AGE_SECONDS:
            raise HTTPException(
                status_code=400,
                detail=f"Payload too old ({int(age)}s > {MAX_PAYLOAD_AGE_SECONDS}s)"
            )
    except HTTPException:
        raise
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp: {e}")


def _upsert_records(table: str, records: list) -> int:
    """
    Write records to SQLite using INSERT OR REPLACE.
    Skips records with unknown columns gracefully.
    Returns count of records written.
    """
    if not records:
        return 0

    written = 0
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")

        # Get actual columns for this table
        existing_cols = {
            row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if not existing_cols:
            logger.warning(f"Sync upsert: table '{table}' not found in DB, skipping")
            conn.close()
            return 0

        for record in records:
            # Filter to only columns that exist in the table
            filtered = {
                k: v for k, v in record.items()
                if k in existing_cols
            }
            if not filtered:
                continue

            cols = list(filtered.keys())
            vals = list(filtered.values())
            placeholders = ", ".join(["?"] * len(cols))
            col_names = ", ".join(cols)

            sql = f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})"
            try:
                conn.execute(sql, vals)
                written += 1
            except Exception as e:
                logger.warning(f"Sync upsert row error in {table}: {e} | record id={record.get('id')}")

        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Sync upsert failed for table {table}: {e}")

    return written


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
    total_written = 0

    for table, data in domains.items():
        if table not in ALLOWED_TABLES:
            logger.warning(f"Sync: ignoring unknown table '{table}'")
            continue
        records = data.get("records", []) if isinstance(data, dict) else data
        total_received += len(records)
        written = _upsert_records(table, records)
        total_written += written
        logger.info(f"Sync {table}: {len(records)} received, {written} written")

    logger.info(f"Sync {sync_id} complete: {total_received} received, {total_written} written to DB")
    return {
        "status": "accepted",
        "sync_id": sync_id,
        "records_received": total_received,
        "records_written": total_written,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.get("/status")
async def sync_status():
    return {
        "environment": "REMOTEBACKUP",
        "receiver": "active",
        "timestamp": datetime.utcnow().isoformat(),
    }
