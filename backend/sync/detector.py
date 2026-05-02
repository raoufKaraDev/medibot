"""
ChangeDetector — queries SQLite for records updated since last sync.
"""
import sqlite3
from datetime import datetime
from config import DB_PATH

SYNC_TABLES = [
    "audit_logs",
    "dispensing_events",
    "patients",
    "prescriptions",
    "medications",
    "stock_levels",
    "doctors",
]

# Tables that are always full snapshot (no timestamp filtering)
SNAPSHOT_TABLES = {"stock_levels", "medications"}

# WARNING: Never sync these fields — security sensitive
EXCLUDED_FIELDS = {
    "doctors": {"password_hash", "rfid_hash", "pin_hash",
                "password", "rfid_code", "pin_code"},
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
            # Get column names
            cursor.execute(f"PRAGMA table_info({table})")
            all_cols = [row["name"] for row in cursor.fetchall()]
            if not all_cols:
                return []  # Table does not exist yet

            safe_cols = [c for c in all_cols if c not in excluded]
            col_select = ", ".join(safe_cols)

            if table in SNAPSHOT_TABLES:
                cursor.execute(f"SELECT {col_select} FROM {table}")
            else:
                # Filter by updated_at or created_at
                ts_col = "updated_at" if "updated_at" in all_cols \
                    else "created_at" if "created_at" in all_cols \
                    else None
                if ts_col:
                    cursor.execute(
                        f"SELECT {col_select} FROM {table} "
                        f"WHERE {ts_col} > ?",
                        (since.isoformat(),)
                    )
                else:
                    cursor.execute(f"SELECT {col_select} FROM {table}")

            return [dict(row) for row in cursor.fetchall()]
        except sqlite3.OperationalError:
            return []  # Table missing — skip silently
