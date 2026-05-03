"""
SyncScheduler — runs sync every 5 minutes with exponential backoff retry.

CRITICAL: sender.send_sync() and flush_retry_queue() use the synchronous
`requests` library which BLOCKS the event loop if called directly in a
coroutine. All blocking calls are wrapped with asyncio.to_thread() so
FastAPI remains fully responsive at all times.
"""
import asyncio
import logging
import sqlite3
from datetime import datetime
from config import DB_PATH, SYNC_ENABLED, IS_LOCAL
from sync.detector import ChangeDetector
from sync.builder import SyncPayloadBuilder
from sync.sender import SyncSender

logger = logging.getLogger("medibot.sync.scheduler")

RETRY_INTERVALS = [60, 300, 1800, 3600, 86400]
SYNC_INTERVAL_SECONDS = 300  # 5 minutes
STARTUP_DELAY_SECONDS = 30   # let FastAPI fully boot first


def _get_last_sync_time() -> datetime:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT last_successful_sync FROM sync_metadata LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        if row and row[0]:
            return datetime.fromisoformat(row[0])
    except Exception:
        pass
    return datetime.min


def _update_sync_metadata(
    last_sync: datetime,
    retry_count: int = 0,
    records_sent: int = 0,
) -> None:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sync_metadata (
                id INTEGER PRIMARY KEY DEFAULT 1,
                last_successful_sync TEXT,
                last_sync_id TEXT,
                retry_count INTEGER DEFAULT 0,
                records_sent_last INTEGER DEFAULT 0,
                updated_at TEXT
            )
        """)
        cursor.execute("""
            INSERT INTO sync_metadata (id, last_successful_sync,
                retry_count, records_sent_last, updated_at)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                last_successful_sync = excluded.last_successful_sync,
                retry_count = excluded.retry_count,
                records_sent_last = excluded.records_sent_last,
                updated_at = excluded.updated_at
        """, (
            last_sync.isoformat(),
            retry_count,
            records_sent,
            datetime.utcnow().isoformat(),
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to update sync metadata: {e}")


def _run_sync_cycle(sender: SyncSender, detector: ChangeDetector, builder: SyncPayloadBuilder):
    """Blocking sync work — runs in a thread via asyncio.to_thread."""
    flushed = sender.flush_retry_queue()
    if flushed:
        logger.info(f"Flushed {flushed} queued sync payloads")

    since = _get_last_sync_time()
    changes = detector.detect_changes(since)
    total_records = sum(
        len(v["records"]) if isinstance(v, dict) else len(v)
        for v in changes.values()
    )

    if total_records == 0:
        logger.debug("No changes to sync")
        return True, 0

    payload = builder.build_payload(changes)
    success = sender.send_sync(payload)
    return success, total_records


async def run_sync_loop() -> None:
    """
    Main sync loop. Blocking HTTP calls run in asyncio.to_thread()
    so they never freeze the FastAPI event loop.
    """
    if not SYNC_ENABLED or not IS_LOCAL:
        logger.info("Sync disabled or not LOCAL — sync loop not started")
        return

    logger.info(f"Sync loop: waiting {STARTUP_DELAY_SECONDS}s for server startup...")
    await asyncio.sleep(STARTUP_DELAY_SECONDS)

    detector = ChangeDetector()
    builder = SyncPayloadBuilder()
    sender = SyncSender()
    retry_count = 0

    logger.info("Sync loop started — every 5 minutes")

    while True:
        sleep_seconds = SYNC_INTERVAL_SECONDS
        try:
            # Run all blocking work in a thread — event loop stays free
            success, total_records = await asyncio.to_thread(
                _run_sync_cycle, sender, detector, builder
            )

            if total_records == 0:
                retry_count = 0
            elif success:
                retry_count = 0
                _update_sync_metadata(
                    last_sync=datetime.utcnow(),
                    retry_count=0,
                    records_sent=total_records,
                )
                logger.info(f"Sync complete: {total_records} records sent")
            else:
                retry_count += 1
                if retry_count >= len(RETRY_INTERVALS):
                    logger.error("Sync offline for 1 day — manual intervention required")
                    retry_count = len(RETRY_INTERVALS) - 1
                sleep_seconds = RETRY_INTERVALS[retry_count]

        except Exception as e:
            logger.error(f"Sync loop error: {e}")
            retry_count = min(retry_count + 1, len(RETRY_INTERVALS) - 1)
            sleep_seconds = RETRY_INTERVALS[retry_count]

        await asyncio.sleep(sleep_seconds)
