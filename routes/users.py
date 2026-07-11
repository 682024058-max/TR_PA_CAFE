from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json
from security import hash_password
from middleware import role_required
import pymysql

users_bp = Blueprint('users', __name__)

@users_bp.route('/api/users', methods=['GET'])
@role_required('manager')
def get_users():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_user,nama,username,email,role,status,password FROM users ORDER BY id_user")
            rows = cur.fetchall()
        result = []
        for r in rows:
            pw = r.get('password', '') or ''
            is_hashed = ':' in pw
            result.append({
                'id_user': r['id_user'],
                'nama': r['nama'],
                'username': r['username'],
                'email': r['email'],
                'role': r['role'],
                'status': r['status'],
                'password_plain': None if is_hashed else pw
            })
        return jsonify({"status": "success", "data": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@users_bp.route('/api/users', methods=['POST'])
@role_required('manager')
def add_user():
    data = request.get_json()
    for f in ['nama', 'username', 'password', 'email', 'role']:
        if not data.get(f):
            return jsonify({"status": "error", "message": f"Field '{f}' wajib diisi!"}), 400
    if data['role'] not in ('kasir', 'manager'):
        return jsonify({"status": "error", "message": "Role harus kasir atau manager."}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_user FROM users WHERE username=%s", (data['username'],))
            if cur.fetchone():
                return jsonify({"status": "error", "message": "Username sudah digunakan oleh pengguna lain."}), 409
            cur.execute("SELECT id_user FROM users WHERE email=%s", (data['email'],))
            if cur.fetchone():
                return jsonify({"status": "error", "message": "Email sudah digunakan oleh pengguna lain."}), 409
            hashed_pw = hash_password(data['password'])
            cur.execute(
                "INSERT INTO users (nama,username,password,email,role,status) VALUES (%s,%s,%s,%s,%s,'aktif')",
                (data['nama'], data['username'], hashed_pw, data['email'], data['role'])
            )
        return jsonify({"status": "success", "message": "User berhasil ditambahkan."}), 201
    except pymysql.err.IntegrityError:
        return jsonify({"status": "error", "message": "Username atau email sudah digunakan."}), 409
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@users_bp.route('/api/users/<int:id_user>', methods=['PUT'])
@role_required('manager')
def update_user(id_user):
    data = request.get_json()
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            if 'username' in data and data['username']:
                cur.execute("SELECT id_user FROM users WHERE username=%s AND id_user!=%s", (data['username'], id_user))
                if cur.fetchone():
                    return jsonify({"status": "error", "message": "Username sudah digunakan oleh pengguna lain."}), 409
            if 'email' in data and data['email']:
                cur.execute("SELECT id_user FROM users WHERE email=%s AND id_user!=%s", (data['email'], id_user))
                if cur.fetchone():
                    return jsonify({"status": "error", "message": "Email sudah digunakan oleh pengguna lain."}), 409
            fields, values = [], []
            for col in ['nama', 'username', 'email', 'role', 'status', 'password']:
                if col in data and data[col] is not None:
                    val = data[col]
                    if col == 'password':
                        val = hash_password(val)
                    fields.append(f"{col}=%s"); values.append(val)
            if not fields:
                return jsonify({"status": "error", "message": "Tidak ada data yang diubah."}), 400
            values.append(id_user)
            cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id_user=%s", values)
        return jsonify({"status": "success", "message": "User berhasil diperbarui."}), 200
    except pymysql.err.IntegrityError:
        return jsonify({"status": "error", "message": "Username atau email sudah digunakan."}), 409
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@users_bp.route('/api/users/<int:id_user>', methods=['DELETE'])
@role_required('manager')
def delete_user(id_user):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id_user=%s", (id_user,))
        return jsonify({"status": "success", "message": "User berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()
