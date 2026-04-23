import sqlite3
conn = sqlite3.connect('c:\ROBOT_MED\backend\medibot.db')
cursor = conn.execute("PRAGMA table_info(audit_log)")
print("Audit Log Table Schema:")
for row in cursor:
    print(f"  {row}")
conn.close()
