"""
SyncPayloadBuilder — serializes changes into a signed sync payload.
"""
import json
import hashlib
from datetime import datetime
from uuid import uuid4


class SyncPayloadBuilder:
    def build_payload(self, changes: dict) -> dict:
        sync_id = f"sync_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}_{str(uuid4())[:8]}"

        domains = {}
        for table, records in changes.items():
            domains[table] = {
                "count": len(records),
                "records": records,
            }

        payload = {
            "sync_id": sync_id,
            "timestamp": datetime.utcnow().isoformat(),
            "local_database_id": "LOCALHOSPITAL_PRIMARY",
            "domains": domains,
        }

        # Checksum over domains only
        domains_json = json.dumps(payload["domains"], sort_keys=True,
                                  default=str)
        payload["checksum"] = hashlib.sha256(
            domains_json.encode()
        ).hexdigest()

        return payload
