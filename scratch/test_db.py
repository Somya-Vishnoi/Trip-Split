import sqlite3
import json

conn = sqlite3.connect('data/tripsplit_cache.db')
cursor = conn.cursor()

cursor.execute("SELECT key, length(value) FROM api_cache")
rows = cursor.fetchall()
print("All cached keys:")
for row in rows:
    print(f"  Key: {row[0]}, Length: {row[1]}")

print("\nQuerying geocode_himachal_pradesh:")
cursor.execute("SELECT value FROM api_cache WHERE key = 'geocode_himachal_pradesh'")
row = cursor.fetchone()
if row:
    print(json.loads(row[0]))
else:
    print("Not found in database")
conn.close()
