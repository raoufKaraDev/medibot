import sqlite3
conn = sqlite3.connect('medibot.db')

# Remove demo doctors (keep real ones)
conn.execute("DELETE FROM doctors WHERE rfid_uid LIKE 'DEMO%'")
conn.execute("DELETE FROM doctors WHERE name LIKE '%Demo%'")
conn.execute("DELETE FROM doctors WHERE name LIKE '%Test%'")

# Remove demo patients (keep real ones)
conn.execute("DELETE FROM patients WHERE first_name LIKE '%Test%'")
conn.execute("DELETE FROM patients WHERE diagnostic LIKE '%demo%'")

# Reset all counters
conn.execute("DELETE FROM dispense_log")
conn.execute("DELETE FROM sqlite_sequence WHERE name='dispense_log'")

conn.commit()
conn.close()
print("Done")
