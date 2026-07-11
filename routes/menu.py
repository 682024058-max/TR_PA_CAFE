from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json, serialize
from middleware import role_required
import re
import cloudinary
import cloudinary.uploader

menu_bp = Blueprint('menu', __name__)

# ── KATEGORI ─────────────────────────────────────────────────

@menu_bp.route('/api/kategori', methods=['GET'])
def get_kategori():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_kategori, nama_kategori, icon FROM kategori ORDER BY id_kategori")
            rows = cur.fetchall()
        data = []
        for r in rows:
            text = r['nama_kategori'].lower().strip()
            text = re.sub(r'[^a-z0-9\s-]', '', text)
            slug = re.sub(r'[\s-]+', '-', text)
            data.append({
                "db_id": r['id_kategori'],
                "id_kategori": slug,
                "nama_kategori": r['nama_kategori'],
                "icon": r['icon']
            })
        return jsonify({"status": "success", "data": data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/kategori', methods=['POST'])
@role_required('manager')
def add_category():
    data = request.get_json() or {}
    nama_kategori = data.get('nama_kategori', '').strip()
    icon = data.get('icon', 'fa-tag').strip()
    if not nama_kategori:
        return jsonify({"status": "error", "message": "Nama kategori wajib diisi!"}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_kategori FROM kategori WHERE LOWER(nama_kategori)=LOWER(%s)", (nama_kategori,))
            if cur.fetchone():
                return jsonify({"status": "error", "message": "Kategori dengan nama tersebut sudah ada."}), 409
            cur.execute("INSERT INTO kategori (nama_kategori, icon) VALUES (%s, %s)", (nama_kategori, icon))
        return jsonify({"status": "success", "message": "Kategori baru berhasil ditambahkan."}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/kategori/<int:id_kategori>', methods=['PUT'])
@role_required('manager')
def update_category(id_kategori):
    data = request.get_json() or {}
    nama_kategori = data.get('nama_kategori', '').strip()
    if not nama_kategori:
        return jsonify({"status": "error", "message": "Nama kategori wajib diisi!"}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_kategori FROM kategori WHERE LOWER(nama_kategori)=LOWER(%s) AND id_kategori!=%s",
                (nama_kategori, id_kategori)
            )
            if cur.fetchone():
                return jsonify({"status": "error", "message": "Kategori dengan nama tersebut sudah ada."}), 409
            cur.execute("UPDATE kategori SET nama_kategori=%s WHERE id_kategori=%s", (nama_kategori, id_kategori))
        return jsonify({"status": "success", "message": "Kategori berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/kategori/<int:id_kategori>', methods=['DELETE'])
@role_required('manager')
def delete_category(id_kategori):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM products WHERE kategori="
                "(SELECT nama_kategori FROM kategori WHERE id_kategori=%s)",
                (id_kategori,)
            )
            res = cur.fetchone()
            if res and res['cnt'] > 0:
                return jsonify({"status": "error", "message": "Kategori tidak dapat dihapus karena masih memiliki produk terkait."}), 409
            cur.execute("DELETE FROM kategori WHERE id_kategori=%s", (id_kategori,))
        return jsonify({"status": "success", "message": "Kategori berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


# ── PRODUCTS ─────────────────────────────────────────────────

@menu_bp.route('/api/products', methods=['GET'])
def get_products():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            kat = request.args.get('kategori')
            if kat:
                cur.execute(
                    "SELECT id_products AS id_product, nama_produk AS nama_product, kategori, harga, foto, warna "
                    "FROM products WHERE kategori=%s ORDER BY id_products", (kat,)
                )
            else:
                cur.execute(
                    "SELECT id_products AS id_product, nama_produk AS nama_product, kategori, harga, foto, warna "
                    "FROM products ORDER BY id_products"
                )
            rows = cur.fetchall()
        return jsonify({"status": "success", "data": rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/products/<int:id_product>', methods=['GET'])
def get_product_detail(id_product):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_products AS id_product, nama_produk AS nama_product, kategori, harga, foto, warna "
                "FROM products WHERE id_products=%s", (id_product,)
            )
            row = cur.fetchone()
        if not row:
            return jsonify({"status": "error", "message": "Produk tidak ditemukan."}), 404
        return jsonify({"status": "success", "data": {k: serialize(v) for k, v in row.items()}}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/products', methods=['POST'])
@role_required('manager')
def add_product():
    data = request.get_json()
    for f in ['nama_product', 'harga', 'kategori']:
        if data.get(f) is None:
            return jsonify({"status": "error", "message": f"Field '{f}' wajib diisi!"}), 400
    foto = data.get('foto')
    foto_url = None
    if foto:
        if foto.startswith("data:image/"):
            try:
                res = cloudinary.uploader.upload(foto, folder="products")
                foto_url = res.get("secure_url")
            except Exception as e:
                print("Gagal upload foto menu ke Cloudinary:", e)
        else:
            foto_url = foto
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO products (nama_produk, kategori, harga, foto, warna) VALUES (%s,%s,%s,%s,%s)",
                (data['nama_product'], data['kategori'], data['harga'], foto_url, data.get('warna', '#4e3629'))
            )
        return jsonify({"status": "success", "message": "Produk berhasil ditambahkan."}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/products/<int:id_product>', methods=['PUT'])
@role_required('manager')
def update_product(id_product):
    data = request.get_json()
    foto = data.get('foto')
    if foto and foto.startswith("data:image/"):
        try:
            res = cloudinary.uploader.upload(foto, folder="products")
            data['foto'] = res.get("secure_url")
        except Exception as e:
            print("Gagal upload foto menu ke Cloudinary:", e)
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            fields, values = [], []
            for col in ['nama_product', 'kategori', 'harga', 'foto', 'warna']:
                if col in data:
                    db_col = 'nama_produk' if col == 'nama_product' else col
                    fields.append(f"{db_col}=%s"); values.append(data[col])
            if not fields:
                return jsonify({"status": "error", "message": "Tidak ada data yang diubah."}), 400
            values.append(id_product)
            cur.execute(f"UPDATE products SET {', '.join(fields)} WHERE id_products=%s", values)
        return jsonify({"status": "success", "message": "Produk berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@menu_bp.route('/api/products/<int:id_product>', methods=['DELETE'])
@role_required('manager')
def delete_product(id_product):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM products WHERE id_products=%s", (id_product,))
        return jsonify({"status": "success", "message": "Produk berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()
