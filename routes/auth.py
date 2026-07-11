from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json, serialize
from security import hash_password, verify_password
import pymysql

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/status', methods=['GET'])
def check_status():
    try:
        conn = get_db(); conn.close()
        return jsonify({"status": "success", "message": "Server & database aktif!", "database_connected": True}), 200
    except Exception as e:
        return jsonify({"status": "warning", "message": str(e), "database_connected": False}), 200


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "Body harus JSON!"}), 400
    username = data.get("username", "").strip()
    password = data.get("password", "")
    if not username or not password:
        return jsonify({"status": "error", "message": "Username dan Password wajib diisi!"}), 400

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
            return jsonify({"status": "error", "message": "Username atau Password salah."}), 401

        is_correct, needs_upgrade = verify_password(user['password'], password)
        if is_correct and needs_upgrade:
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
            return jsonify({"status": "error", "message": "Username atau Password salah."}), 401

        if user['status'] == 'nonaktif':
            return jsonify({"status": "error", "message": "Akun dinonaktifkan. Hubungi Manager."}), 403

        return jsonify({
            "status": "success", "message": "Login berhasil!", "role": user['role'],
            "user": {"id": user['id_user'], "nama": user['nama'],
                     "username": user['username'], "email": user['email']}
        }), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()
