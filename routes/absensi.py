from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json
from middleware import role_required
import cloudinary
import cloudinary.uploader

absensi_bp = Blueprint('absensi', __name__)

@absensi_bp.route('/api/absensi', methods=['GET'])
@role_required('kasir', 'manager')
def get_absensi():
    role       = request.headers.get("X-User-Role", "").lower()
    nama_kasir = request.headers.get("X-User-Name", "")
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
        return jsonify({"status": "success", "data": rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@absensi_bp.route('/api/absensi/masuk', methods=['POST'])
@role_required('kasir', 'manager')
def absensi_masuk():
    data = request.get_json() or {}
    nama_kasir = data.get('nama_kasir', '').strip()
    if not nama_kasir:
        nama_kasir = request.headers.get("X-User-Name", "").strip()
    if not nama_kasir:
        return jsonify({"status": "error", "message": "nama_kasir wajib diisi!"}), 400

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
                return jsonify({"status": "error", "message": "Anda sudah absen masuk hari ini."}), 409
            cur.execute(
                "INSERT INTO absensi (date, nama_kasir, jam_masuk, status, foto_masuk) "
                "VALUES (CURDATE(), %s, NOW(), 'Hadir', %s)",
                (nama_kasir, foto_url)
            )
            id_absensi = cur.lastrowid
        return jsonify({"status": "success", "message": "Absen masuk berhasil!", "id_absensi": id_absensi}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@absensi_bp.route('/api/absensi/keluar', methods=['PUT'])
@role_required('kasir', 'manager')
def absensi_keluar():
    data = request.get_json() or {}
    nama_kasir = request.headers.get("X-User-Name", "").strip()
    if not nama_kasir:
        nama_kasir = data.get('nama_kasir', '').strip()
    if not nama_kasir:
        return jsonify({"status": "error", "message": "nama_kasir diperlukan."}), 400

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
                return jsonify({"status": "error",
                    "message": "Belum absen masuk hari ini atau sudah absen keluar."}), 404
        return jsonify({"status": "success", "message": "Absen keluar berhasil!"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@absensi_bp.route('/api/absensi/<int:id_absensi>', methods=['PUT'])
@role_required('manager')
def update_absensi(id_absensi):
    data = request.get_json()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            fields, values = [], []
            for col in ['jam_masuk', 'jam_keluar', 'status', 'total_jam']:
                if col in data and data[col] is not None:
                    fields.append(f"{col}=%s"); values.append(data[col])
            if not fields:
                return jsonify({"status": "error", "message": "Tidak ada data yang diubah."}), 400
            values.append(id_absensi)
            cur.execute(f"UPDATE absensi SET {', '.join(fields)} WHERE id_absensi=%s", values)
        return jsonify({"status": "success", "message": "Absensi berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@absensi_bp.route('/api/absensi/<int:id_absensi>', methods=['DELETE'])
@role_required('manager')
def delete_absensi(id_absensi):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM absensi WHERE id_absensi=%s", (id_absensi,))
        return jsonify({"status": "success", "message": "Data absensi berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()
