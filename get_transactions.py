import os
import urllib.parse
import pymysql

# Load .env
base_dir = r"c:\Users\Acer\Downloads\Cafe"
env_path = os.path.join(base_dir, ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip("'").strip('"')

DATABASE_URL = os.environ.get("DATABASE_URL")
parsed = urllib.parse.urlparse(DATABASE_URL)
conn = pymysql.connect(
    host=parsed.hostname, user=parsed.username, password=parsed.password,
    database=parsed.path.lstrip('/'), port=parsed.port or 4000, ssl={'ssl': {}},
    cursorclass=pymysql.cursors.DictCursor, autocommit=True
)

with conn.cursor() as cur:
    cur.execute("SELECT * FROM transaksi")
    rows = cur.fetchall()
    print("TOTAL TRANSACTIONS:", len(rows))
    for r in rows:
        print(f"ID: {r['id_transaksi']}, UserID: {r['id_user']}, Tanggal: {r['tanggal_transaksi']}, Total: {r['total_harga']}, Metode: {r['metode_pembayaran']}, Status: {r['status_transaksi']}")
conn.close()
