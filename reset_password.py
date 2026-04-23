import sqlite3
from config import DB_PATH

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

password_hash = '$'2b$'12$'oKK0BM/m1ERvLZZNiTndDOaiu1fQeF7t9W99j32ppMWKPJ0Hc9M1W'

cursor.execute(
    'UPDATE doctors SET password_hash=?, passwordhash=? WHERE username=" kara\ OR rfid_uid=\3E487B89\',
 (password_hash, password_hash)
)

result = cursor.execute('SELECT id, username, name, password_hash FROM doctors WHERE username=\kara\ OR rfid_uid=\3E487B89\').fetchall()

conn.commit()
conn.close()

print('✅ Password updated successfully!')
print('\nUser Details:')
for row in result:
 r = dict(row)
 print(f' ID: {r[\id\]}')
 print(f' Username: {r[\username\]}')
 print(f' Name: {r[\name\]}')
 print(f' Password Hash Set: {\Yes\ if r[\password_hash\] else \No\}')

print('\n✅ You can now login with:')
print(' Username: kara')
print(' Password: kara1235')
