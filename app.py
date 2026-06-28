# =======================================================
# KOPI SIBEI - POS CAFE BACKEND — DISESUAIKAN STRUKTUR DB
# Tabel nyata: users, kategori, products, transaksi,
#              detail_transaksi, absensi
# =======================================================

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import pymysql, pymysql.cursors, decimal
from datetime import date, datetime, timedelta
from functools import wraps
from security import hash_password, verify_password
import threading
import time
import urllib.request
import json
import base64
import re
from fpdf import FPDF

app = Flask(__name__)
CORS(app)

import os
import urllib.parse

# Load .env file manually if exists (avoiding python-dotenv dependency)
base_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(base_dir, ".env")
if os.path.exists(env_path):
    try:
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    val = val.strip().strip("'").strip('"')
                    os.environ[key.strip()] = val
    except Exception as e:
        print("Gagal membaca file .env secara manual:", e)

# ── Konfigurasi Cloudinary ────────────────────────────────────
import cloudinary
import cloudinary.uploader
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True
)

# Parse DATABASE_URL if present, otherwise read individual variables
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    try:
        # Standardize prefix for urlparse (mysql+pymysql:// -> mysql://)
        url_str = DATABASE_URL
        if url_str.startswith("mysql+pymysql://"):
            url_str = url_str.replace("mysql+pymysql://", "mysql://", 1)
        parsed = urllib.parse.urlparse(url_str)
        DB_HOST     = parsed.hostname or "localhost"
        DB_USER     = parsed.username or "root"
        DB_PASSWORD = parsed.password or ""
        DB_PORT     = parsed.port or 4000  # Default TiDB port is 4000
        DB_NAME     = parsed.path.lstrip('/') or "Sibei"
    except Exception as e:
        print("Gagal mem-parsing DATABASE_URL, menggunakan fallback default:", e)
        DB_HOST     = os.environ.get("DB_HOST", "localhost")
        DB_USER     = os.environ.get("DB_USER", "root")
        DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
        DB_NAME     = os.environ.get("DB_NAME", "Sibei")
        DB_PORT     = int(os.environ.get("DB_PORT", 3306))
else:
    DB_HOST     = os.environ.get("DB_HOST", "localhost")
    DB_USER     = os.environ.get("DB_USER", "root")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
    DB_NAME     = os.environ.get("DB_NAME", "Sibei")
    DB_PORT     = int(os.environ.get("DB_PORT", 3306))

# ── Konfigurasi Resend API & Laporan Otomatis ────────────────
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "re_KaTaQNWQ_EJvAZLzSKgJE3nyiEUZHJ2Nx")
RESEND_SENDER  = os.environ.get("RESEND_SENDER", "Kopi Sibei <onboarding@resend.dev>")
AUTO_REPORT_TIME = "00:00"  # Format HH:MM (24 jam)

# ── Koneksi ──────────────────────────────────────────────────
def get_db():
    ssl_config = None
    if "localhost" not in DB_HOST:
        ssl_config = {'ssl': {}}
        
    return pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME, port=DB_PORT, ssl=ssl_config,
        cursorclass=pymysql.cursors.DictCursor, autocommit=True,
        init_command="SET time_zone = '+07:00'"
    )

def serialize(obj):
    if isinstance(obj, (date, datetime)): return obj.isoformat()
    if isinstance(obj, timedelta):        return str(obj)
    if isinstance(obj, decimal.Decimal):  return float(obj)
    return obj

def rows_to_json(rows):
    return [{k: serialize(v) for k, v in row.items()} for row in rows]

# ── Role guard ───────────────────────────────────────────────
def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            role = request.headers.get("X-User-Role", "").lower()
            if role not in roles:
                return jsonify({"status":"error",
                    "message":f"Akses ditolak. Hanya {'/'.join(roles)} yang diizinkan."}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

# ============================================================
#  STATUS
# ============================================================
@app.route('/api/status', methods=['GET'])
def check_status():
    try:
        conn = get_db(); conn.close()
        return jsonify({"status":"success","message":"Server & database aktif!","database_connected":True}), 200
    except Exception as e:
        return jsonify({"status":"warning","message":str(e),"database_connected":False}), 200

# ============================================================
#  LOGIN
# Kolom users: id_user, nama, username, password, email, role, status
# ============================================================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"status":"error","message":"Body harus JSON!"}), 400
    username = data.get("username","").strip()
    password = data.get("password","")
    if not username or not password:
        return jsonify({"status":"error","message":"Username dan Password wajib diisi!"}), 400

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_user, nama, username, password, email, role, status "
                "FROM users WHERE username=%s",
                (username,)
            )
            user = cur.fetchone()
        if not user:
            return jsonify({"status":"error","message":"Username atau Password salah."}), 401
            
        # Verify password using security helper
        is_correct, needs_upgrade = verify_password(user['password'], password)
        if is_correct and needs_upgrade:
            # Automatically upgrade/migrate plaintext password in the DB to hashed version
            try:
                hashed_pw = hash_password(password)
                with conn.cursor() as upgrade_cur:
                    upgrade_cur.execute(
                        "UPDATE users SET password=%s WHERE id_user=%s",
                        (hashed_pw, user['id_user'])
                    )
            except Exception as ex:
                print("Failed to auto-upgrade password hash:", ex)
                    
        if not is_correct:
            return jsonify({"status":"error","message":"Username atau Password salah."}), 401
            
        if user['status'] == 'nonaktif':
            return jsonify({"status":"error","message":"Akun dinonaktifkan. Hubungi Manager."}), 403
        return jsonify({
            "status":"success","message":"Login berhasil!","role":user['role'],
            "user":{"id":user['id_user'],"nama":user['nama'],
                    "username":user['username'],"email":user['email']}
        }), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ============================================================
#  USERS  (hanya manager)
# ============================================================
@app.route('/api/users', methods=['GET'])
@role_required('manager')
def get_users():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_user,nama,username,email,role,status FROM users ORDER BY id_user")
            rows = cur.fetchall()
        return jsonify({"status":"success","data":rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/users', methods=['POST'])
@role_required('manager')
def add_user():
    data = request.get_json()
    for f in ['nama','username','password','email','role']:
        if not data.get(f):
            return jsonify({"status":"error","message":f"Field '{f}' wajib diisi!"}), 400
    if data['role'] not in ('kasir','manager'):
        return jsonify({"status":"error","message":"Role harus kasir atau manager."}), 400
    conn = None
    try:
        conn = get_db()
        hashed_pw = hash_password(data['password'])
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (nama,username,password,email,role,status) VALUES (%s,%s,%s,%s,%s,'aktif')",
                (data['nama'],data['username'],hashed_pw,data['email'],data['role'])
            )
        return jsonify({"status":"success","message":"User berhasil ditambahkan."}), 201
    except pymysql.err.IntegrityError:
        return jsonify({"status":"error","message":"Username atau email sudah digunakan."}), 409
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/users/<int:id_user>', methods=['PUT'])
@role_required('manager')
def update_user(id_user):
    data = request.get_json()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            fields, values = [], []
            for col in ['nama','email','role','status','password']:
                if col in data and data[col] is not None:
                    val = data[col]
                    if col == 'password':
                        val = hash_password(val)
                    fields.append(f"{col}=%s"); values.append(val)
            if not fields:
                return jsonify({"status":"error","message":"Tidak ada data yang diubah."}), 400
            values.append(id_user)
            cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id_user=%s", values)
        return jsonify({"status":"success","message":"User berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/users/<int:id_user>', methods=['DELETE'])
@role_required('manager')
def delete_user(id_user):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id_user=%s", (id_user,))
        return jsonify({"status":"success","message":"User berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ============================================================
#  KATEGORI  — Dinamis dari tabel kategori di database
# ============================================================
@app.route('/api/kategori', methods=['GET'])
def get_kategori():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_kategori, nama_kategori, icon FROM kategori ORDER BY id_kategori")
            rows = cur.fetchall()
        data = []
        import re
        for r in rows:
            text = r['nama_kategori'].lower().strip()
            text = re.sub(r'[^a-z0-9\s-]', '', text)
            slug = re.sub(r'[\s-]+', '-', text)
            data.append({
                "id_kategori": slug,
                "nama_kategori": r['nama_kategori'],
                "icon": r['icon']
            })
        return jsonify({"status":"success","data":data}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/kategori', methods=['POST'])
@role_required('manager')
def add_category():
    data = request.get_json() or {}
    nama_kategori = data.get('nama_kategori', '').strip()
    icon = data.get('icon', 'fa-tag').strip()
    if not nama_kategori:
        return jsonify({"status":"error","message":"Nama kategori wajib diisi!"}), 400
    
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            # Cek duplikat
            cur.execute("SELECT id_kategori FROM kategori WHERE LOWER(nama_kategori)=LOWER(%s)", (nama_kategori,))
            if cur.fetchone():
                return jsonify({"status":"error","message":"Kategori dengan nama tersebut sudah ada."}), 409
            
            cur.execute("INSERT INTO kategori (nama_kategori, icon) VALUES (%s, %s)", (nama_kategori, icon))
        return jsonify({"status":"success","message":"Kategori baru berhasil ditambahkan."}), 201
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()


# ============================================================
#  PRODUCTS
# Kolom nyata: id_products, nama_produk, kategori(enum),
#              harga, icon, warna, dibuat_, update_
# ============================================================
@app.route('/api/products', methods=['GET'])
def get_products():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            kat = request.args.get('kategori')
            if kat:
                cur.execute(
                    "SELECT id_products AS id_product, nama_produk AS nama_product, kategori, harga, icon, warna "
                    "FROM products WHERE kategori=%s ORDER BY id_products", (kat,)
                )
            else:
                cur.execute(
                    "SELECT id_products AS id_product, nama_produk AS nama_product, kategori, harga, icon, warna "
                    "FROM products ORDER BY id_products"
                )
            rows = cur.fetchall()
        return jsonify({"status":"success","data":rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/products/<int:id_product>', methods=['GET'])
def get_product_detail(id_product):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_products AS id_product, nama_produk AS nama_product, kategori, harga, icon, warna "
                "FROM products WHERE id_products=%s", (id_product,)
            )
            row = cur.fetchone()
        if not row:
            return jsonify({"status":"error","message":"Produk tidak ditemukan."}), 404
        return jsonify({"status":"success","data":{k:serialize(v) for k,v in row.items()}}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/products', methods=['POST'])
@role_required('manager')
def add_product():
    data = request.get_json()
    for f in ['nama_product','harga','kategori']:
        if data.get(f) is None:
            return jsonify({"status":"error","message":f"Field '{f}' wajib diisi!"}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO products (nama_produk, kategori, harga, icon, warna) VALUES (%s,%s,%s,%s,%s)",
                (data['nama_product'], data['kategori'], data['harga'],
                 data.get('icon','fa-mug-hot'), data.get('warna','#4e3629'))
            )
        return jsonify({"status":"success","message":"Produk berhasil ditambahkan."}), 201
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/products/<int:id_product>', methods=['PUT'])
@role_required('manager')
def update_product(id_product):
    data = request.get_json()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            fields, values = [], []
            for col in ['nama_product','kategori','harga','icon','warna']:
                if col in data and data[col] is not None:
                    db_col = 'nama_produk' if col == 'nama_product' else col
                    fields.append(f"{db_col}=%s"); values.append(data[col])
            if not fields:
                return jsonify({"status":"error","message":"Tidak ada data yang diubah."}), 400
            values.append(id_product)
            cur.execute(f"UPDATE products SET {', '.join(fields)} WHERE id_products=%s", values)
        return jsonify({"status":"success","message":"Produk berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/products/<int:id_product>', methods=['DELETE'])
@role_required('manager')
def delete_product(id_product):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM products WHERE id_products=%s", (id_product,))
        return jsonify({"status":"success","message":"Produk berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ============================================================
#  TRANSAKSI
# Kolom nyata: id_transaksi, id_user, tanggal_transaksi,
#              total_harga, metode_pembayaran (enum Cash/QRIS/Debit),
#              uang_bayar, kembalian, status_transaksi
#
# detail_transaksi: id_detail, id_transaksi, id_products, qty, subtotal
# ============================================================
@app.route('/api/transaksi', methods=['GET'])
@role_required('kasir','manager')
def get_transaksi():
    role    = request.headers.get("X-User-Role","").lower()
    user_id = request.headers.get("X-User-Id")
    tanggal = request.args.get("tanggal")

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            sql = ("SELECT t.*, u.nama AS nama_kasir "
                   "FROM transaksi t LEFT JOIN users u ON t.id_user=u.id_user WHERE 1=1")
            params = []
            if role == 'kasir' and user_id and request.args.get('all_cashiers') != 'true':
                sql += " AND t.id_user=%s"; params.append(user_id)
            if tanggal:
                sql += " AND DATE(t.tanggal_transaksi)=%s"; params.append(tanggal)
            sql += " ORDER BY t.id_transaksi DESC"
            cur.execute(sql, params)
            rows = cur.fetchall()
        return jsonify({"status":"success","data":rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/transaksi/<int:id_transaksi>', methods=['GET'])
@role_required('kasir','manager')
def get_transaksi_detail(id_transaksi):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT t.*, u.nama AS nama_kasir FROM transaksi t "
                "LEFT JOIN users u ON t.id_user=u.id_user WHERE t.id_transaksi=%s",
                (id_transaksi,)
            )
            header = cur.fetchone()
            if not header:
                return jsonify({"status":"error","message":"Transaksi tidak ditemukan."}), 404
            
            cur.execute(
                "SELECT dt.id_detail, dt.id_transaksi, dt.id_products, dt.qty, dt.subtotal, "
                "p.nama_produk AS nama_product, p.harga AS harga_satuan "
                "FROM detail_transaksi dt "
                "LEFT JOIN products p ON dt.id_products=p.id_products "
                "WHERE dt.id_transaksi=%s",
                (id_transaksi,)
            )
            items = cur.fetchall()
        result = {k:serialize(v) for k,v in header.items()}
        result['items'] = rows_to_json(items)
        return jsonify({"status":"success","data":result}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/transaksi', methods=['POST'])
@role_required('kasir','manager')
def create_transaksi():
    data = request.get_json()
    if not data or not data.get('items'):
        return jsonify({"status":"error","message":"Data transaksi dan items wajib ada!"}), 400

    conn = None
    try:
        conn = get_db()
        conn.begin()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO transaksi "
                "(id_user, tanggal_transaksi, total_harga, metode_pembayaran, uang_bayar, kembalian) "
                "VALUES (%s, NOW(), %s, %s, %s, %s)",
                (
                    data['id_user'],
                    data['total_harga'],
                    data.get('metode_pembayaran', 'Cash'),
                    data.get('uang_bayar', 0),
                    data.get('kembalian', 0)
                )
            )
            id_transaksi = cur.lastrowid

            for item in data['items']:
                cur.execute(
                    "INSERT INTO detail_transaksi (id_transaksi, id_products, qty, subtotal) "
                    "VALUES (%s, %s, %s, %s)",
                    (id_transaksi, item['id_product'], item['qty'], item['subtotal'])
                )

        conn.commit()
        return jsonify({
            "status":"success","message":"Transaksi berhasil disimpan.","id_transaksi":id_transaksi
        }), 201
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/transaksi/<int:id_transaksi>', methods=['DELETE'])
@role_required('manager')
def delete_transaksi(id_transaksi):
    conn = None
    try:
        conn = get_db()
        conn.begin()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM detail_transaksi WHERE id_transaksi=%s", (id_transaksi,))
            cur.execute("DELETE FROM transaksi WHERE id_transaksi=%s", (id_transaksi,))
        conn.commit()
        return jsonify({"status":"success","message":"Transaksi berhasil dihapus."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ============================================================
#  LAPORAN (manager)
# ============================================================
@app.route('/api/laporan/harian', methods=['GET'])
@role_required('manager')
def laporan_harian():
    dari   = request.args.get('dari',   date.today().isoformat())
    sampai = request.args.get('sampai', date.today().isoformat())
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DATE(tanggal_transaksi) AS tanggal, COUNT(*) AS jumlah_transaksi, "
                "SUM(total_harga) AS total_pendapatan "
                "FROM transaksi WHERE DATE(tanggal_transaksi) BETWEEN %s AND %s "
                "GROUP BY DATE(tanggal_transaksi) ORDER BY tanggal",
                (dari, sampai)
            )
            rows = cur.fetchall()
        return jsonify({"status":"success","data":rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ============================================================
#  ABSENSI
# Kolom nyata: id_absensi, date(date), nama_kasir(varchar),
#              jam_masuk(time), jam_keluar(time),
#              total_jam(decimal), status(varchar), waktu_dibuat
# ============================================================
@app.route('/api/absensi', methods=['GET'])
@role_required('kasir','manager')
def get_absensi():
    role       = request.headers.get("X-User-Role","").lower()
    nama_kasir = request.headers.get("X-User-Name","")
    tanggal    = request.args.get("tanggal")

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            sql    = "SELECT * FROM absensi WHERE 1=1"
            params = []
            if role == 'kasir' and nama_kasir:
                sql += " AND nama_kasir=%s"; params.append(nama_kasir)
            if tanggal:
                sql += " AND date=%s"; params.append(tanggal)
            sql += " ORDER BY id_absensi DESC"
            cur.execute(sql, params)
            rows = cur.fetchall()
        return jsonify({"status":"success","data":rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/absensi/masuk', methods=['POST'])
@role_required('kasir','manager')
def absensi_masuk():
    data = request.get_json() or {}
    nama_kasir = data.get('nama_kasir','').strip()
    if not nama_kasir:
        nama_kasir = request.headers.get("X-User-Name","").strip()
    if not nama_kasir:
        return jsonify({"status":"error","message":"nama_kasir wajib diisi!"}), 400

    foto = data.get('foto')
    foto_url = None
    if foto:
        try:
            res = cloudinary.uploader.upload(foto, folder="absensi")
            foto_url = res.get("secure_url")
        except Exception as e:
            print("Gagal upload foto masuk ke Cloudinary:", e)

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_absensi FROM absensi WHERE nama_kasir=%s AND date=CURDATE()",
                (nama_kasir,)
            )
            if cur.fetchone():
                return jsonify({"status":"error","message":"Anda sudah absen masuk hari ini."}), 409
            cur.execute(
                "INSERT INTO absensi (date, nama_kasir, jam_masuk, status, foto_masuk) "
                "VALUES (CURDATE(), %s, NOW(), 'Hadir', %s)",
                (nama_kasir, foto_url)
            )
            id_absensi = cur.lastrowid
        return jsonify({"status":"success","message":"Absen masuk berhasil!","id_absensi":id_absensi}), 201
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/absensi/keluar', methods=['PUT'])
@role_required('kasir','manager')
def absensi_keluar():
    data = request.get_json() or {}
    nama_kasir = request.headers.get("X-User-Name","").strip()
    if not nama_kasir:
        nama_kasir = data.get('nama_kasir','').strip()
    if not nama_kasir:
        return jsonify({"status":"error","message":"nama_kasir diperlukan."}), 400

    foto = data.get('foto')
    foto_url = None
    if foto:
        try:
            res = cloudinary.uploader.upload(foto, folder="absensi")
            foto_url = res.get("secure_url")
        except Exception as e:
            print("Gagal upload foto keluar ke Cloudinary:", e)

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE absensi "
                "SET jam_keluar=NOW(), "
                "    total_jam=ROUND(TIMESTAMPDIFF(MINUTE, jam_masuk, NOW())/60.0, 2), "
                "    foto_keluar=%s "
                "WHERE nama_kasir=%s AND date=CURDATE() AND jam_keluar IS NULL",
                (foto_url, nama_kasir)
            )
            if cur.rowcount == 0:
                return jsonify({"status":"error",
                    "message":"Belum absen masuk hari ini atau sudah absen keluar."}), 404
        return jsonify({"status":"success","message":"Absen keluar berhasil!"}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/absensi/<int:id_absensi>', methods=['PUT'])
@role_required('manager')
def update_absensi(id_absensi):
    data = request.get_json()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            fields, values = [], []
            for col in ['jam_masuk','jam_keluar','status','total_jam']:
                if col in data and data[col] is not None:
                    fields.append(f"{col}=%s"); values.append(data[col])
            if not fields:
                return jsonify({"status":"error","message":"Tidak ada data yang diubah."}), 400
            values.append(id_absensi)
            cur.execute(f"UPDATE absensi SET {', '.join(fields)} WHERE id_absensi=%s", values)
        return jsonify({"status":"success","message":"Absensi berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/absensi/<int:id_absensi>', methods=['DELETE'])
@role_required('manager')
def delete_absensi(id_absensi):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM absensi WHERE id_absensi=%s", (id_absensi,))
        return jsonify({"status":"success","message":"Data absensi berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ── Fungsi Pendukung Laporan Penjualan (HTML & Resend API) ────
def format_idr_py(val):
    return f"Rp {val:,.0f}".replace(",", ".")

def build_sales_report_html(start_date, end_date):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT SUM(total_harga) as total_revenue, COUNT(id_transaksi) as total_tx "
                "FROM transaksi WHERE DATE(tanggal_transaksi) BETWEEN %s AND %s",
                (start_date, end_date)
            )
            summary = cur.fetchone()
            total_revenue = summary['total_revenue'] or 0
            total_tx = summary['total_tx'] or 0

            cur.execute(
                "SELECT metode_pembayaran, SUM(total_harga) as total_amount, COUNT(id_transaksi) as count_tx "
                "FROM transaksi WHERE DATE(tanggal_transaksi) BETWEEN %s AND %s "
                "GROUP BY metode_pembayaran",
                (start_date, end_date)
            )
            methods_data = cur.fetchall()
            methods_summary = {"Cash": {"amount": 0, "count": 0}, "QRIS": {"amount": 0, "count": 0}, "Debit": {"amount": 0, "count": 0}}
            for m in methods_data:
                m_name = m['metode_pembayaran']
                if m_name in methods_summary:
                    methods_summary[m_name]["amount"] = m['total_amount'] or 0
                    methods_summary[m_name]["count"] = m['count_tx'] or 0

            cur.execute(
                "SELECT p.nama_produk, SUM(dt.qty) as total_qty "
                "FROM detail_transaksi dt "
                "JOIN products p ON dt.id_products = p.id_products "
                "JOIN transaksi t ON dt.id_transaksi = t.id_transaksi "
                "WHERE DATE(t.tanggal_transaksi) BETWEEN %s AND %s "
                "GROUP BY dt.id_products, p.nama_produk "
                "ORDER BY total_qty DESC LIMIT 5",
                (start_date, end_date)
            )
            top_menus = cur.fetchall()

            cur.execute(
                "SELECT u.nama, SUM(t.total_harga) as total_sales, COUNT(t.id_transaksi) as total_tx "
                "FROM transaksi t "
                "JOIN users u ON t.id_user = u.id_user "
                "WHERE DATE(t.tanggal_transaksi) BETWEEN %s AND %s "
                "GROUP BY t.id_user, u.nama "
                "ORDER BY total_sales DESC",
                (start_date, end_date)
            )
            top_cashiers = cur.fetchall()

            cur.execute(
                "SELECT t.id_transaksi, t.tanggal_transaksi, u.nama as nama_kasir, t.total_harga, t.metode_pembayaran "
                "FROM transaksi t "
                "LEFT JOIN users u ON t.id_user=u.id_user "
                "WHERE DATE(t.tanggal_transaksi) BETWEEN %s AND %s "
                "ORDER BY t.id_transaksi ASC",
                (start_date, end_date)
            )
            tx_details = cur.fetchall()
            
            date_label = start_date if start_date == end_date else f"{start_date} s/d {end_date}"

            html = f"""
            <html>
            <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f7f5f2; color: #4a3e3d; margin: 0; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.08); border: 1px solid #e1dcd6;">
                    
                    <!-- Header -->
                    <div style="background-color: #4a3321; padding: 24px; text-align: center; color: #ffffff;">
                        <span style="font-size: 28px; display: block; margin-bottom: 6px;">☕</span>
                        <h2 style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; letter-spacing: 0.5px;">Laporan Penjualan Kopi Sibei</h2>
                        <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">Periode: {date_label}</p>
                    </div>

                    <div style="padding: 24px;">
                        <!-- Ringkasan Grid -->
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                            <tr>
                                <td style="width: 48%; padding: 12px; background-color: #fcf9f6; border-radius: 8px; border: 1px solid #f0e9df; text-align: center;">
                                    <span style="font-size: 12px; text-transform: uppercase; color: #8e7c77; font-weight: 600; display: block; margin-bottom: 4px;">Total Pendapatan</span>
                                    <strong style="font-size: 20px; color: #2e7d32; display: block;">{format_idr_py(total_revenue)}</strong>
                                </td>
                                <td style="width: 4%;"></td>
                                <td style="width: 48%; padding: 12px; background-color: #fcf9f6; border-radius: 8px; border: 1px solid #f0e9df; text-align: center;">
                                    <span style="font-size: 12px; text-transform: uppercase; color: #8e7c77; font-weight: 600; display: block; margin-bottom: 4px;">Total Transaksi</span>
                                    <strong style="font-size: 20px; color: #4a3321; display: block;">{total_tx} Tx</strong>
                                </td>
                            </tr>
                        </table>

                        <!-- Metode Pembayaran -->
                        <h3 style="border-bottom: 2px solid #f0e9df; padding-bottom: 6px; margin-top: 0; color: #4a3321;">Metode Pembayaran</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                            <thead>
                                <tr style="background-color: #f5f2eb; border-bottom: 1px solid #e1dcd6;">
                                    <th style="text-align: left; padding: 8px; color: #8e7c77;">Metode</th>
                                    <th style="text-align: center; padding: 8px; color: #8e7c77;">Transaksi</th>
                                    <th style="text-align: right; padding: 8px; color: #8e7c77;">Jumlah</th>
                                </tr>
                            </thead>
                            <tbody>
            """
            for method, info in methods_summary.items():
                html += f"""
                                <tr style="border-bottom: 1px solid #f5f2eb;">
                                    <td style="padding: 10px 8px; font-weight: 500;">{method}</td>
                                    <td style="padding: 10px 8px; text-align: center;">{info['count']}</td>
                                    <td style="padding: 10px 8px; text-align: right; font-weight: bold; color: #4a3e3d;">{format_idr_py(info['amount'])}</td>
                                </tr>
                """
            html += """
                            </tbody>
                        </table>

                        <!-- Menu Terlaris -->
                        <h3 style="border-bottom: 2px solid #f0e9df; padding-bottom: 6px; margin-top: 0; color: #4a3321;">5 Menu Terlaris</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                            <thead>
                                <tr style="background-color: #f5f2eb; border-bottom: 1px solid #e1dcd6;">
                                    <th style="text-align: left; padding: 8px; color: #8e7c77;">Nama Menu</th>
                                    <th style="text-align: right; padding: 8px; color: #8e7c77;">Volume Terjual</th>
                                </tr>
                            </thead>
                            <tbody>
            """
            if not top_menus:
                html += """
                                <tr>
                                    <td colspan="2" style="padding: 12px; text-align: center; color: #8e7c77; font-style: italic;">Tidak ada penjualan menu hari ini</td>
                                </tr>
                """
            for menu in top_menus:
                html += f"""
                                <tr style="border-bottom: 1px solid #f5f2eb;">
                                    <td style="padding: 10px 8px;">{menu['nama_produk']}</td>
                                    <td style="padding: 10px 8px; text-align: right; font-weight: bold; color: #4a3321;">{menu['total_qty']} Porsi</td>
                                </tr>
                """
            html += """
                            </tbody>
                        </table>

                        <!-- Laporan Detil Transaksi -->
                        <h3 style="border-bottom: 2px solid #f0e9df; padding-bottom: 6px; margin-top: 0; color: #4a3321;">Detil Transaksi</h3>
                        <div style="max-height: 250px; overflow-y: auto; border: 1px solid #e1dcd6; border-radius: 6px; margin-bottom: 24px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                <thead>
                                    <tr style="background-color: #f5f2eb; border-bottom: 1px solid #e1dcd6; position: sticky; top: 0;">
                                        <th style="text-align: left; padding: 8px; color: #8e7c77;">ID</th>
                                        <th style="text-align: left; padding: 8px; color: #8e7c77;">Kasir</th>
                                        <th style="text-align: center; padding: 8px; color: #8e7c77;">Metode</th>
                                        <th style="text-align: right; padding: 8px; color: #8e7c77;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
            """
            if not tx_details:
                html += """
                                    <tr>
                                        <td colspan="4" style="padding: 12px; text-align: center; color: #8e7c77; font-style: italic;">Tidak ada transaksi hari ini</td>
                                    </tr>
                """
            for tx in tx_details:
                tx_id_str = f"TX-{str(tx['id_transaksi']).zfill(6)}"
                html += f"""
                                    <tr style="border-bottom: 1px solid #f5f2eb;">
                                        <td style="padding: 8px;">{tx_id_str}</td>
                                        <td style="padding: 8px;">{tx['nama_kasir'] or '-'}</td>
                                        <td style="padding: 8px; text-align: center;">{tx['metode_pembayaran']}</td>
                                        <td style="padding: 8px; text-align: right; font-weight: bold;">{format_idr_py(tx['total_harga'])}</td>
                                    </tr>
                """
            html += f"""
                                </tbody>
                            </table>
                        </div>

                    </div>

                    <!-- Footer -->
                    <div style="background-color: #fcf9f6; padding: 16px; text-align: center; border-top: 1px solid #e1dcd6; font-size: 12px; color: #8e7c77;">
                        <p style="margin: 0;">Email ini dikirim otomatis oleh Sistem POS Kopi Sibei.</p>
                        <p style="margin: 4px 0 0;">&copy; 2026 Sibei Coffee POS. Hak Cipta Dilindungi.</p>
                    </div>
                </div>
            </body>
            </html>
            """
            return html
    except Exception as e:
        print("Gagal membuat HTML laporan:", e)
        return ""
    finally:
        if conn: conn.close()

def send_email_via_resend(recipient, subject, html_content, attachments=None):
    if not RESEND_API_KEY or RESEND_API_KEY.startswith("your-"):
        print("Resend API Key belum diisi. Pengiriman email dilewati (Mode Simulasi).")
        return False
        
    # Auto-fallback jika menggunakan domain onboarding gratis Resend
    if "onboarding@resend.dev" in RESEND_SENDER:
        # Resend membatasi penerima hanya ke email pendaftar API Key (kepineliano@gmail.com)
        recipient = "kepineliano@gmail.com"
        
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    payload = {
        "from": RESEND_SENDER,
        "to": [recipient],
        "subject": subject,
        "html": html_content
    }
    if attachments:
        payload["attachments"] = attachments
    
    try:
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode('utf-8'), 
            headers=headers, 
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            print("Email laporan sukses terkirim via Resend API. Response:", res_body)
            return True
    except Exception as e:
        print("Gagal mengirim email via Resend:", e)
        if hasattr(e, 'read'):
            try:
                print("Error detail Resend API:", e.read().decode('utf-8'))
            except Exception:
                pass
        return False

def get_manager_email():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM users WHERE role='manager' LIMIT 1")
            res = cur.fetchone()
            if res and res['email']:
                return res['email']
    except Exception as e:
        print("Gagal fetch email manager:", e)
    finally:
        if conn: conn.close()
    return "kepineliano@gmail.com" # default fallback

last_sent_date = None

def run_auto_report_scheduler():
    global last_sent_date
    print("=" * 60)
    print(f"  BACKGROUND SCHEDULER: Aktif (waktu kirim harian: {AUTO_REPORT_TIME})")
    print("=" * 60)
    
    while True:
        try:
            now = datetime.now()
            current_time_str = now.strftime("%H:%M")
            current_date_str = now.strftime("%Y-%m-%d")
            
            if current_time_str == AUTO_REPORT_TIME and last_sent_date != current_date_str:
                # Jika berjalan jam 00:00 (tengah malam), target laporan adalah penjualan kemarin (1 hari sebelum hari ini)
                if AUTO_REPORT_TIME == "00:00":
                    report_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
                else:
                    report_date = current_date_str

                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Pemicu scheduler harian aktif untuk tanggal {report_date}...")
                recipient = get_manager_email()
                subject = f"Laporan Penjualan Harian - {report_date}"
                html_content = build_sales_report_html(report_date, report_date)
                
                if html_content:
                    success = send_email_via_resend(recipient, subject, html_content)
                    if success:
                        last_sent_date = current_date_str
                        print(f"Laporan otomatis tanggal {report_date} sukses dikirim ke {recipient}.")
                    else:
                        print(f"Laporan otomatis tanggal {report_date} gagal dikirim. Dicoba lagi nanti.")
                else:
                    print("Laporan kosong atau DB tidak terbaca. Menunda percobaan.")
            time.sleep(30)
        except Exception as e:
            print("Error di thread background scheduler:", e)
            time.sleep(30)

@app.route('/api/report/email', methods=['POST'])
@role_required('manager')
def manual_email_report():
    data = request.get_json() or {}
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    recipient = data.get('recipient_email')
    
    if not start_date or not end_date:
        today = date.today().isoformat()
        start_date = start_date or today
        end_date = end_date or today
        
    if not recipient:
        recipient = get_manager_email()
        
    html_content = build_sales_report_html(start_date, end_date)
    if not html_content:
        return jsonify({"status": "error", "message": "Gagal menyusun laporan penjualan."}), 500
        
    subject = f"Laporan Penjualan Cafe ({start_date} s/d {end_date})"
    success = send_email_via_resend(recipient, subject, html_content)
    
    if success:
        return jsonify({
            "status": "success", 
            "message": f"Laporan penjualan ({start_date} s/d {end_date}) berhasil dikirim ke email {recipient}!"
        }), 200
    else:
        if not RESEND_API_KEY or RESEND_API_KEY.startswith("your-"):
            print("=== SIMULASI LAPORAN EMAIL ===")
            print(html_content)
            print("==============================")
            return jsonify({
                "status": "warning",
                "message": f"Laporan berhasil dibuat! [MODE SIMULASI] Kredensial Resend API belum diisi di app.py. Isi email dicetak di terminal Flask."
            }), 200
        else:
            return jsonify({
                "status": "error", 
                "message": "Gagal mengirimkan email via Resend API. Periksa koneksi internet atau status API Key Anda."
            }), 500

@app.route('/api/cron/daily-report', methods=['GET', 'POST'])
def cron_daily_report():
    # Mengamankan endpoint agar hanya bisa dipanggil oleh server Vercel Cron
    auth_header = request.headers.get("Authorization")
    cron_secret = os.environ.get("CRON_SECRET")
    
    is_vercel_cron = False
    if auth_header and cron_secret and auth_header == f"Bearer {cron_secret}":
        is_vercel_cron = True
    elif request.headers.get("X-Vercel-Signature"):
        is_vercel_cron = True
    elif request.headers.get("User-Agent") == "vercel-cron/1.0":
        is_vercel_cron = True
        
    if os.environ.get("VERCEL") == "1" and not is_vercel_cron:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    # Ambil tanggal kemarin untuk dilaporkan
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    recipient = get_manager_email()
    subject = f"☕ [AUTO] Laporan Penjualan Harian - {yesterday}"
    html_content = build_sales_report_html(yesterday, yesterday)
    
    if html_content:
        success = send_email_via_resend(recipient, subject, html_content)
        if success:
            return jsonify({"status": "success", "message": f"Cron sukses mengirim laporan {yesterday} ke {recipient}."}), 200
        
    return jsonify({"status": "error", "message": "Gagal mengirim laporan otomatis."}), 500

# ============================================================
#  PENGGAJIAN (PAYROLL CRUD)
# ============================================================
def init_payroll_table():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS penggajian (
                    id_penggajian INT AUTO_INCREMENT PRIMARY KEY,
                    id_kasir INT NOT NULL,
                    periode VARCHAR(7) NOT NULL,
                    rate_per_shift INT NOT NULL DEFAULT 75000,
                    total_shift INT NOT NULL DEFAULT 0,
                    total_gaji INT NOT NULL,
                    bukti_tf LONGTEXT DEFAULT NULL,
                    tanggal_dibuat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (id_kasir) REFERENCES users(id_user) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
        print("Tabel penggajian berhasil diinisialisasi.")
    except Exception as e:
        print("Gagal menginisialisasi tabel penggajian:", e)
    finally:
        if conn: conn.close()

@app.route('/api/payroll/calculate-shifts', methods=['GET'])
@role_required('manager')
def calculate_shifts():
    cashier_name = request.args.get('cashier', '').strip()
    period = request.args.get('period', '').strip() # format 'YYYY-MM'
    
    if not cashier_name or not period:
        return jsonify({"status":"error","message":"Parameters 'cashier' and 'period' are required."}), 400
        
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            # Hitung jumlah kehadiran di absensi pada periode tersebut
            cur.execute(
                "SELECT COUNT(*) AS total_shifts FROM absensi "
                "WHERE nama_kasir=%s AND DATE_FORMAT(date, '%%Y-%%m')=%s AND status='Hadir'",
                (cashier_name, period)
            )
            res = cur.fetchone()
            total_shifts = res['total_shifts'] if res else 0
        return jsonify({"status":"success","total_shifts":total_shifts}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/payroll', methods=['GET'])
@role_required('manager')
def get_payroll():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            # 1. Ambil semua kasir yang aktif
            cur.execute("SELECT id_user, nama FROM users WHERE role='kasir'")
            cashiers = cur.fetchall()
            
            # 2. Ambil semua periode unik (bulan-tahun) dari tabel absensi
            cur.execute("SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') AS period FROM absensi WHERE date IS NOT NULL")
            periods = [row['period'] for row in cur.fetchall() if row['period']]
            
            # Jika tabel absensi masih kosong, tambahkan periode bulan ini sebagai default
            if not periods:
                periods = [datetime.now().strftime('%Y-%m')]
                
            for period in periods:
                for cashier in cashiers:
                    # Hitung total kehadiran shift kasir tersebut pada periode ini
                    cur.execute(
                        "SELECT COUNT(*) AS total_shifts FROM absensi "
                        "WHERE nama_kasir=%s AND DATE_FORMAT(date, '%%Y-%%m')=%s AND status='Hadir'",
                        (cashier['nama'], period)
                    )
                    res = cur.fetchone()
                    total_shifts = res['total_shifts'] if res else 0
                    
                    # Kita hanya buat data gaji otomatis jika kasir tersebut memiliki minimal 1 kehadiran/shift
                    if total_shifts > 0:
                        # Cek apakah sudah ada di tabel penggajian
                        cur.execute(
                            "SELECT id_penggajian, rate_per_shift FROM penggajian "
                            "WHERE id_kasir=%s AND periode=%s",
                            (cashier['id_user'], period)
                        )
                        exist = cur.fetchone()
                        
                        if not exist:
                            # Belum ada -> Insert data gaji baru (default rate Rp 75.000)
                            default_rate = 75000
                            total_salary = default_rate * total_shifts
                            cur.execute(
                                "INSERT INTO penggajian (id_kasir, periode, rate_per_shift, total_shift, total_gaji) "
                                "VALUES (%s, %s, %s, %s, %s)",
                                (cashier['id_user'], period, default_rate, total_shifts, total_salary)
                            )
                        else:
                            # Sudah ada -> Update total_shift & total_gaji berdasarkan absensi terbaru
                            rate = exist['rate_per_shift']
                            total_salary = rate * total_shifts
                            cur.execute(
                                "UPDATE penggajian SET total_shift=%s, total_gaji=%s "
                                "WHERE id_penggajian=%s",
                                (total_shifts, total_salary, exist['id_penggajian'])
                            )
            
            # 3. Ambil data penggajian final untuk dikirim ke frontend
            cur.execute(
                "SELECT p.id_penggajian AS id, u.nama AS cashier, p.periode AS period, "
                "p.rate_per_shift AS ratePerShift, p.total_shift AS totalShifts, "
                "p.total_gaji AS totalSalary, p.bukti_tf AS buktiTF "
                "FROM penggajian p JOIN users u ON p.id_kasir = u.id_user "
                "ORDER BY p.id_penggajian DESC"
            )
            rows = cur.fetchall()
        return jsonify({"status":"success","data":rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/payroll', methods=['POST'])
@role_required('manager')
def add_payroll():
    data = request.get_json() or {}
    cashier_name = data.get('cashier', '').strip()
    period = data.get('period', '').strip()
    rate_per_shift = int(data.get('ratePerShift', 75000))
    total_shifts = int(data.get('totalShifts', 0))
    total_salary = rate_per_shift * total_shifts
    
    if not cashier_name or not period:
        return jsonify({"status":"error","message":"Nama kasir dan periode wajib diisi!"}), 400
        
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            # Cari id_user untuk kasir
            cur.execute("SELECT id_user FROM users WHERE nama=%s LIMIT 1", (cashier_name,))
            user = cur.fetchone()
            if not user:
                return jsonify({"status":"error","message":f"Kasir dengan nama '{cashier_name}' tidak ditemukan."}), 404
            
            # Cek apakah sudah pernah diinput untuk kasir dan periode yang sama
            cur.execute("SELECT id_penggajian FROM penggajian WHERE id_kasir=%s AND periode=%s", (user['id_user'], period))
            if cur.fetchone():
                return jsonify({"status":"error","message":f"Data gaji untuk {cashier_name} periode {period} sudah ada."}), 409
                
            cur.execute(
                "INSERT INTO penggajian (id_kasir, periode, rate_per_shift, total_shift, total_gaji) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user['id_user'], period, rate_per_shift, total_shifts, total_salary)
            )
        return jsonify({"status":"success","message":"Data penggajian kasir berhasil ditambahkan."}), 201
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/payroll/<int:id_payroll>', methods=['PUT'])
@role_required('manager')
def update_payroll(id_payroll):
    data = request.get_json() or {}
    cashier_name = data.get('cashier', '').strip()
    period = data.get('period', '').strip()
    rate_per_shift = int(data.get('ratePerShift', 75000))
    total_shifts = int(data.get('totalShifts', 0))
    total_salary = rate_per_shift * total_shifts
    
    if not cashier_name or not period:
        return jsonify({"status":"error","message":"Nama kasir dan periode wajib diisi!"}), 400
        
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            # Cari id_user untuk kasir
            cur.execute("SELECT id_user FROM users WHERE nama=%s LIMIT 1", (cashier_name,))
            user = cur.fetchone()
            if not user:
                return jsonify({"status":"error","message":f"Kasir dengan nama '{cashier_name}' tidak ditemukan."}), 404
                
            cur.execute(
                "UPDATE penggajian SET id_kasir=%s, periode=%s, rate_per_shift=%s, total_shift=%s, total_gaji=%s "
                "WHERE id_penggajian=%s",
                (user['id_user'], period, rate_per_shift, total_shifts, total_salary, id_payroll)
            )
        return jsonify({"status":"success","message":"Data penggajian kasir berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/payroll/<int:id_payroll>', methods=['DELETE'])
@role_required('manager')
def delete_payroll(id_payroll):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM penggajian WHERE id_penggajian=%s", (id_payroll,))
        return jsonify({"status":"success","message":"Data penggajian kasir berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/payroll/<int:id_payroll>/upload-bukti', methods=['POST'])
@role_required('manager')
def upload_bukti_payroll(id_payroll):
    data = request.get_json() or {}
    bukti_tf = data.get('buktiTF')
    
    if not bukti_tf:
        return jsonify({"status":"error","message":"Bukti transfer kosong!"}), 400
        
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("UPDATE penggajian SET bukti_tf=%s WHERE id_penggajian=%s", (bukti_tf, id_payroll))
        return jsonify({"status":"success","message":"Bukti transfer berhasil disimpan ke database."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

@app.route('/api/payroll/<int:id_payroll>/bukti', methods=['DELETE'])
@role_required('manager')
def delete_bukti_payroll(id_payroll):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("UPDATE penggajian SET bukti_tf=NULL WHERE id_penggajian=%s", (id_payroll,))
        return jsonify({"status":"success","message":"Bukti transfer berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500
    finally:
        if conn: conn.close()

# ============================================================ 
#  PAGE ROUTING (rendering templates)
# ============================================================
@app.route('/')
@app.route('/login')
@app.route('/login.html')
def route_login():
    return render_template('login.html')

@app.route('/kasir')
@app.route('/kasir.html')
def route_kasir():
    return render_template('kasir/kasir.html')

@app.route('/manager')
@app.route('/manager.html')
def route_manager():
    return render_template('manager/manager.html')

# ============================================================
if __name__ == '__main__':
    import os
    init_payroll_table()
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        scheduler_thread = threading.Thread(target=run_auto_report_scheduler, daemon=True)
        scheduler_thread.start()

    print("=" * 55)
    print("  KOPI SIBEI BACKEND — sesuai struktur DB nyata")
    print("  Status: http://127.0.0.1:5000/api/status")
    print("=" * 55)
    app.run(debug=True, port=5000)