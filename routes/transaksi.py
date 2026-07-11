from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json
from middleware import role_required
import cloudinary
import cloudinary.uploader

transaksi_bp = Blueprint('transaksi', __name__)

@transaksi_bp.route('/api/transaksi', methods=['GET'])
@role_required('kasir', 'manager')
def get_transaksi():
    role    = request.headers.get("X-User-Role", "").lower()
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
        return jsonify({"status": "success", "data": rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@transaksi_bp.route('/api/transaksi/<int:id_transaksi>', methods=['GET'])
@role_required('kasir', 'manager')
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
                return jsonify({"status": "error", "message": "Transaksi tidak ditemukan."}), 404
            cur.execute(
                "SELECT dt.id_detail, dt.id_transaksi, dt.id_products, dt.qty, dt.subtotal, "
                "p.nama_produk AS nama_product, p.harga AS harga_satuan "
                "FROM detail_transaksi dt "
                "LEFT JOIN products p ON dt.id_products=p.id_products "
                "WHERE dt.id_transaksi=%s",
                (id_transaksi,)
            )
            items = cur.fetchall()
        from db import serialize
        result = {k: serialize(v) for k, v in header.items()}
        result['items'] = rows_to_json(items)
        return jsonify({"status": "success", "data": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@transaksi_bp.route('/api/transaksi', methods=['POST'])
@role_required('kasir', 'manager')
def create_transaksi():
    data = request.get_json()
    if not data or not data.get('items'):
        return jsonify({"status": "error", "message": "Data transaksi dan items wajib ada!"}), 400

    metode_pembayaran = data.get('metode_pembayaran', 'Cash')
    bukti_tf_url = None
    if metode_pembayaran == 'QRIS':
        foto_bukti_tf = data.get('foto_bukti_tf')
        if foto_bukti_tf:
            try:
                res = cloudinary.uploader.upload(foto_bukti_tf, folder="qris_bukti")
                bukti_tf_url = res.get("secure_url")
            except Exception as e:
                print("Gagal upload foto bukti transfer QRIS ke Cloudinary:", e)

    conn = None
    try:
        conn = get_db()
        conn.begin()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO transaksi "
                "(id_user, tanggal_transaksi, total_harga, metode_pembayaran, uang_bayar, kembalian, bukti_tf) "
                "VALUES (%s, NOW(), %s, %s, %s, %s, %s)",
                (
                    data['id_user'],
                    data['total_harga'],
                    metode_pembayaran,
                    data.get('uang_bayar', 0),
                    data.get('kembalian', 0),
                    bukti_tf_url
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
        return jsonify({"status": "success", "message": "Transaksi berhasil disimpan.", "id_transaksi": id_transaksi}), 201
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@transaksi_bp.route('/api/transaksi/<int:id_transaksi>', methods=['DELETE'])
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
        return jsonify({"status": "success", "message": "Transaksi berhasil dihapus."}), 200
    except Exception as e:
        if conn: conn.rollback()
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()
