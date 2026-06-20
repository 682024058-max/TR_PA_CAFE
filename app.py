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

app = Flask(__name__)
CORS(app)

DB_HOST     = "localhost"
DB_USER     = "root"
DB_PASSWORD = ""
DB_NAME     = "cafe"
DB_PORT     = 3306

# ── Koneksi ──────────────────────────────────────────────────
def get_db():
    return pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASSWORD,
        database=DB_NAME, port=DB_PORT,
        cursorclass=pymysql.cursors.DictCursor, autocommit=True
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
                "SELECT id_user, nama, username, email, role, status "
                "FROM users WHERE username=%s AND password=%s",
                (username, password)
            )
            user = cur.fetchone()
        if not user:
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
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (nama,username,password,email,role,status) VALUES (%s,%s,%s,%s,%s,'aktif')",
                (data['nama'],data['username'],data['password'],data['email'],data['role'])
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
                    fields.append(f"{col}=%s"); values.append(data[col])
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
#  KATEGORI  — hardcoded sesuai ENUM kolom products.kategori
# ============================================================
@app.route('/api/kategori', methods=['GET'])
def get_kategori():
    data = [
        {"id_kategori": "coffee",     "nama_kategori": "Coffee"},
        {"id_kategori": "non-coffee", "nama_kategori": "Non Coffee"},
        {"id_kategori": "snack",      "nama_kategori": "Snack"},
        {"id_kategori": "dessert",    "nama_kategori": "Dessert"},
    ]
    return jsonify({"status":"success","data":data}), 200

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
                "INSERT INTO absensi (date, nama_kasir, jam_masuk, status) "
                "VALUES (CURDATE(), %s, NOW(), 'Hadir')",
                (nama_kasir,)
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
    nama_kasir = request.headers.get("X-User-Name","").strip()
    if not nama_kasir:
        data = request.get_json() or {}
        nama_kasir = data.get('nama_kasir','').strip()
    if not nama_kasir:
        return jsonify({"status":"error","message":"nama_kasir diperlukan di header X-User-Name."}), 400

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE absensi "
                "SET jam_keluar=NOW(), "
                "    total_jam=ROUND(TIMESTAMPDIFF(MINUTE, jam_masuk, NOW())/60.0, 2) "
                "WHERE nama_kasir=%s AND date=CURDATE() AND jam_keluar IS NULL",
                (nama_kasir,)
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
    print("=" * 55)
    print("  KOPI SIBEI BACKEND — sesuai struktur DB nyata")
    print("  Status: http://127.0.0.1:5000/api/status")
    print("=" * 55)
    app.run(debug=True, port=5000)