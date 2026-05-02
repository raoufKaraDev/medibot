"""
SyncSender — sends payload to remote over HTTPS with retry queue.
"""
import json
import logging
import os
import requests
from datetime import datetime
from config import BACKUP_URL, BACKUP_API_KEY, SYNC_RETRY_ATTEMPTS

logger = logging.getLogger("medibot.sync.sender")

RETRY_QUEUE_FILE = "sync_retry_queue.json"
MAX_QUEUE_SIZE = 100


class SyncSender:
    def __init__(self):
        self.remote_url = f"{BACKUP_URL}/api/sync/push"
        self.timeout = 30

    def send_sync(self, payload: dict) -> bool:
        """Send payload to remote. Returns True if successful."""
        try:
            headers = {}
            if BACKUP_API_KEY:
                headers["X-Sync-Key"] = BACKUP_API_KEY

            response = requests.post(
                self.remote_url,
                json=payload,
                timeout=self.timeout,
                headers=headers,
                verify=True,
            )
            response.raise_for_status()
            logger.info(f"Sync successful: {payload.get('sync_id')}")
            return True

        except requests.exceptions.ConnectionError:
            logger.warning("Sync failed: no internet — queuing for retry")
            self._queue_for_retry(payload)
            return False
        except requests.exceptions.Timeout:
            logger.warning("Sync failed: timeout — queuing for retry")
            self._queue_for_retry(payload)
            return False
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else 0
            if status == 400:
                logger.error(f"Sync rejected by remote (400): {e.response.text}")
                return False  # Do not retry schema errors
            logger.warning(f"Sync failed HTTP {status} — queuing for retry")
            self._queue_for_retry(payload)
            return False
        except Exception as e:
            logger.error(f"Sync unexpected error: {e}")
            self._queue_for_retry(payload)
            return False

    def flush_retry_queue(self) -> int:
        """Attempt to resend queued payloads. Returns count sent."""
        if not os.path.exists(RETRY_QUEUE_FILE):
            return 0
        with open(RETRY_QUEUE_FILE, "r", encoding="utf-8") as f:
            queue: list = json.load(f)
        if not queue:
            return 0

        sent = 0
        remaining = []
        for item in queue:
            if self.send_sync(item["payload"]):
                sent += 1
            else:
                remaining.append(item)

        with open(RETRY_QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(remaining[-MAX_QUEUE_SIZE:], f)

        return sent

    def _queue_for_retry(self, payload: dict) -> None:
        queue = []
        if os.path.exists(RETRY_QUEUE_FILE):
            with open(RETRY_QUEUE_FILE, "r", encoding="utf-8") as f:
                try:
                    queue = json.load(f)
                except json.JSONDecodeError:
                    queue = []

        queue.append({
            "timestamp": datetime.utcnow().isoformat(),
            "sync_id": payload.get("sync_id"),
            "payload": payload,
        })
        # Keep only last MAX_QUEUE_SIZE
        queue = queue[-MAX_QUEUE_SIZE:]
        with open(RETRY_QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(queue, f)
