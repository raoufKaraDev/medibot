"""
ChangeDetector — queries SQLite for records updated since last sync.
"""
import sqlite3
from datetime import datetime
from config import DB_PATH

# Correct table names matching the actual SQLite schema
SYNC_TABLES = [
    "audit_log",
    "dispense_log",
    "patients",
    "prescriptions",
    "medications",
    "pharmacy_stock",
    "doctors",
    "rooms",
    "guardians",
]

# Tables that are always full snapshot (no timestamp filtering)
SNAPSHOT_TABLES = {"pharmacy_stock", "medications", "rooms", "doctors"}

# WARNING: Never sync RFID raw codes — but hashes ARE needed for login
EXCLUDED_FIELDS = {
    "doctors": {"rfid_code", "pin_code"},  # keep password_hash, pin_hash, rfid_uid
}


class ChangeDetector:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def detect_changes(self, since: datetime) -> dict:
        """
        Return dict of table_name → list of row dicts
        for all records updated since `since`.
        """
        changes = {}
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            for table in SYNC_TABLES:
                rows = self._query_table(conn, table, since)
                if rows:  # only include tables that have data
                    changes[table] = rows
        finally:
            conn.close()
        return changes

    def _query_table(
        self, conn: sqlite3.Connection, table: str, since: datetime
    ) -> list[dict]:
        cursor = conn.cursor()
        excluded = EXCLUDED_FIELDS.get(table, set())
        try:
            cursor.execute(f"PRAGMA table_info({table})")
            all_cols = [row["name"] for row in cursor.fetchall()]
            if not all_cols:
                return []  # Table does not exist

            safe_cols = [c for c in all_cols if c not in excluded]
            col_select = ", ".join(safe_cols)

            if table in SNAPSHOT_TABLES:
                cursor.execute(f"SELECT {col_select} FROM {table}")
            else:
                ts_col = (
                    "updated_at" if "updated_at" in all_cols
                    else "createdat" if "createdat" in all_cols
                    else "created_at" if "created_at" in all_cols
                    else "timestamp" if "timestamp" in all_cols
                    else None
                )
                if ts_col:
                    cursor.execute(
                        f"SELECT {col_select} FROM {table} WHERE {ts_col} > ?",
                        (since.isoformat(),)
                    )
                else:
                    cursor.execute(f"SELECT {col_select} FROM {table}")

            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.OperationalError:
            return []  # Table missing — skip silently
