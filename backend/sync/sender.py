"""
SyncSender — sends payload to remote over HTTPS with retry queue.
"""
import hashlib
import json
import logging
import os
import requests
from datetime import datetime
from config import BACKUP_URL, BACKUP_API_KEY, SYNC_RETRY_ATTEMPTS

logger = logging.getLogger("medibot.sync.sender")

RETRY_QUEUE_FILE = "sync_retry_queue.json"
MAX_QUEUE_SIZE = 100
MAX_WARN_COUNT = 3


def _recompute_checksum(payload: dict) -> dict:
    """
    Recompute checksum from the final serialized domains dict.
    Ensures sender and receiver hash the exact same bytes.
    """
    domains_json = json.dumps(payload["domains"], sort_keys=True, default=str)
    payload["checksum"] = hashlib.sha256(domains_json.encode()).hexdigest()
    return payload


class SyncSender:
    def __init__(self):
        self.remote_url = f"{BACKUP_URL}/api/sync/push"
        self.timeout = 15
        self._consecutive_failures = 0

    def send_sync(self, payload: dict) -> bool:
        """Send payload to remote. Returns True if successful."""
        if self._consecutive_failures >= MAX_WARN_COUNT:
            logger.debug("Sync skipped: still offline (silent mode)")
            self._queue_for_retry(payload)
            return False

        payload = _recompute_checksum(dict(payload))
        body = json.dumps(payload, default=str)

        try:
            headers = {
                "Content-Type": "application/json",
            }
            if BACKUP_API_KEY:
                headers["X-Sync-Key"] = BACKUP_API_KEY

            response = requests.post(
                self.remote_url,
                data=body,
                timeout=self.timeout,
                headers=headers,
                verify=True,
            )
            response.raise_for_status()
            self._consecutive_failures = 0
            logger.info(f"Sync successful: {payload.get('sync_id')} "
                        f"({response.status_code})")
            return True

        except requests.exceptions.SSLError as e:
            self._consecutive_failures += 1
            logger.error(f"Sync SSL error: {e}")
            self._queue_for_retry(payload)
            return False
        except requests.exceptions.ConnectionError as e:
            self._consecutive_failures += 1
            logger.warning(
                f"Sync failed: connection error ({self._consecutive_failures}/{MAX_WARN_COUNT}): {e}"
            )
            self._queue_for_retry(payload)
            return False
        except requests.exceptions.Timeout:
            self._consecutive_failures += 1
            logger.warning(
                f"Sync failed: timeout — queuing "
                f"({self._consecutive_failures}/{MAX_WARN_COUNT})"
            )
            self._queue_for_retry(payload)
            return False
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else 0
            body_text = e.response.text if e.response is not None else ""
            logger.error(
                f"Sync HTTP error {status}: {body_text} | "
                f"exception type: {type(e).__name__} | msg: {e}"
            )
            if status == 400:
                return False  # schema error, don't retry
            self._consecutive_failures += 1
            self._queue_for_retry(payload)
            return False
        except Exception as e:
            logger.error(
                f"Sync unexpected error [{type(e).__name__}]: {e}"
            )
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
        queue = queue[-MAX_QUEUE_SIZE:]
        with open(RETRY_QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(queue, f, default=str)
