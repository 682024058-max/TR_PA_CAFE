from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json
from middleware import role_required
from datetime import datetime
import os
import json
import urllib.request

payroll_bp = Blueprint('payroll', __name__)

def _send_slip_email(id_payroll):
    """Kirim slip gaji via Resend API."""
    api_key = os.environ.get("RESEND_API_KEY")
    sender  = os.environ.get("EMAIL_FROM", "Kopi Sibei <onboarding@resend.dev>")

    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT p.*, u.nama, u.email FROM penggajian p "
                "JOIN users u ON p.id_kasir = u.id_user "
                "WHERE p.id_penggajian = %s", (id_payroll,)
            )
            slip = cur.fetchone()
    finally:
        if conn: conn.close()

    if not slip:
        return False, "Data penggajian tidak ditemukan."

    if not api_key:
        return False, "RESEND_API_KEY belum dikonfigurasi."

    recipient = slip.get("email") or "kepineliano@gmail.com"


    total = slip.get("total_gaji", 0)
    shifts = slip.get("total_shift", 0)
    rate   = int(total / shifts) if shifts else 0

    def fmt(v):
        return f"Rp {int(v):,}".replace(",", ".")

    html = f"""
    <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #ddd;border-radius:8px">
      <h2 style="color:#4a3321;text-align:center">☕ Kopi Sibei — Slip Gaji</h2>
      <hr>
      <p><b>Nama:</b> {slip.get('nama','—')}</p>
      <p><b>Email:</b> {slip.get('email','—')}</p>
      <p><b>Periode:</b> {slip.get('periode','—')}</p>
      <hr>
      <p><b>Bayaran per Shift:</b> {fmt(rate)}</p>
      <p><b>Total Shift Hadir:</b> {shifts} shift</p>
      <h3 style="color:#4a3321">Total Gaji: {fmt(total)}</h3>
      <hr>
      <small style="color:#888">Slip ini diterbitkan oleh sistem Kopi Sibei.</small>
    </div>
    """

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
    }
    payload = {
        "from": sender,
        "to": [recipient],
        "subject": f"Slip Gaji {slip.get('nama','Kasir')} — {slip.get('periode','—')}",
        "html": html
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req) as res:
            print("Slip gaji terkirim:", res.read().decode())
            return True, f"Slip gaji berhasil dikirim ke {recipient}."
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, "read"):
            try: error_msg = e.read().decode("utf-8")
            except: pass
        print("Gagal kirim slip gaji:", error_msg)
        return False, f"Gagal mengirim email: {error_msg}"



@payroll_bp.route('/api/payroll/calculate-shifts', methods=['GET'])
@role_required('manager')
def calculate_shifts():
    cashier_name = request.args.get('cashier', '').strip()
    period       = request.args.get('period', '').strip()
    if not cashier_name or not period:
        return jsonify({"status": "error", "message": "Parameters 'cashier' and 'period' are required."}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS total_shifts FROM absensi "
                "WHERE nama_kasir=%s AND DATE_FORMAT(date, '%%Y-%%m')=%s AND status='Hadir'",
                (cashier_name, period)
            )
            res = cur.fetchone()
            total_shifts = res['total_shifts'] if res else 0
        return jsonify({"status": "success", "total_shifts": total_shifts}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll', methods=['GET'])
@role_required('manager')
def get_payroll():
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_user, nama FROM users WHERE role='kasir'")
            cashiers = cur.fetchall()

            cur.execute("SELECT DISTINCT DATE_FORMAT(date, '%Y-%m') AS period FROM absensi WHERE date IS NOT NULL")
            periods = [row['period'] for row in cur.fetchall() if row['period']]

            if not periods:
                periods = [datetime.now().strftime('%Y-%m')]

            for period in periods:
                for cashier in cashiers:
                    cur.execute(
                        "SELECT COUNT(*) AS total_shifts FROM absensi "
                        "WHERE nama_kasir=%s AND DATE_FORMAT(date, '%%Y-%%m')=%s AND status='Hadir'",
                        (cashier['nama'], period)
                    )
                    res = cur.fetchone()
                    total_shifts = res['total_shifts'] if res else 0

                    if total_shifts > 0:
                        cur.execute(
                            "SELECT id_penggajian, rate_per_shift FROM penggajian "
                            "WHERE id_kasir=%s AND periode=%s",
                            (cashier['id_user'], period)
                        )
                        exist = cur.fetchone()

                        if not exist:
                            default_rate = 75000
                            total_salary = default_rate * total_shifts
                            cur.execute(
                                "INSERT INTO penggajian (id_kasir, periode, rate_per_shift, total_shift, total_gaji) "
                                "VALUES (%s, %s, %s, %s, %s)",
                                (cashier['id_user'], period, default_rate, total_shifts, total_salary)
                            )
                        else:
                            rate = exist['rate_per_shift']
                            total_salary = rate * total_shifts
                            cur.execute(
                                "UPDATE penggajian SET total_shift=%s, total_gaji=%s "
                                "WHERE id_penggajian=%s",
                                (total_shifts, total_salary, exist['id_penggajian'])
                            )

            cur.execute(
                "SELECT p.id_penggajian AS id, u.nama AS cashier, p.periode AS period, "
                "p.rate_per_shift AS ratePerShift, p.total_shift AS totalShifts, "
                "p.total_gaji AS totalSalary, p.bukti_tf AS buktiTF "
                "FROM penggajian p JOIN users u ON p.id_kasir = u.id_user "
                "ORDER BY p.id_penggajian DESC"
            )
            rows = cur.fetchall()
        return jsonify({"status": "success", "data": rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll', methods=['POST'])
@role_required('manager')
def add_payroll():
    data = request.get_json() or {}
    cashier_name   = data.get('cashier', '').strip()
    period         = data.get('period', '').strip()
    rate_per_shift = int(data.get('ratePerShift', 75000))
    total_shifts   = int(data.get('totalShifts', 0))
    total_salary   = rate_per_shift * total_shifts

    if not cashier_name or not period:
        return jsonify({"status": "error", "message": "Nama kasir dan periode wajib diisi!"}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_user FROM users WHERE nama=%s LIMIT 1", (cashier_name,))
            user = cur.fetchone()
            if not user:
                return jsonify({"status": "error", "message": f"Kasir '{cashier_name}' tidak ditemukan."}), 404
            cur.execute("SELECT id_penggajian FROM penggajian WHERE id_kasir=%s AND periode=%s", (user['id_user'], period))
            if cur.fetchone():
                return jsonify({"status": "error", "message": f"Data gaji untuk {cashier_name} periode {period} sudah ada."}), 409
            cur.execute(
                "INSERT INTO penggajian (id_kasir, periode, rate_per_shift, total_shift, total_gaji) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user['id_user'], period, rate_per_shift, total_shifts, total_salary)
            )
        return jsonify({"status": "success", "message": "Data penggajian kasir berhasil ditambahkan."}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll/<int:id_payroll>', methods=['PUT'])
@role_required('manager')
def update_payroll(id_payroll):
    data = request.get_json() or {}
    cashier_name   = data.get('cashier', '').strip()
    period         = data.get('period', '').strip()
    rate_per_shift = int(data.get('ratePerShift', 75000))
    total_shifts   = int(data.get('totalShifts', 0))
    total_salary   = rate_per_shift * total_shifts

    if not cashier_name or not period:
        return jsonify({"status": "error", "message": "Nama kasir dan periode wajib diisi!"}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id_user FROM users WHERE nama=%s LIMIT 1", (cashier_name,))
            user = cur.fetchone()
            if not user:
                return jsonify({"status": "error", "message": f"Kasir '{cashier_name}' tidak ditemukan."}), 404
            cur.execute(
                "UPDATE penggajian SET id_kasir=%s, periode=%s, rate_per_shift=%s, total_shift=%s, total_gaji=%s "
                "WHERE id_penggajian=%s",
                (user['id_user'], period, rate_per_shift, total_shifts, total_salary, id_payroll)
            )
        return jsonify({"status": "success", "message": "Data penggajian kasir berhasil diperbarui."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll/<int:id_payroll>', methods=['DELETE'])
@role_required('manager')
def delete_payroll(id_payroll):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM penggajian WHERE id_penggajian=%s", (id_payroll,))
        return jsonify({"status": "success", "message": "Data penggajian kasir berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll/<int:id_payroll>/upload-bukti', methods=['POST'])
@role_required('manager')
def upload_bukti_payroll(id_payroll):
    data = request.get_json() or {}
    bukti_tf = data.get('buktiTF')
    if not bukti_tf:
        return jsonify({"status": "error", "message": "Bukti transfer kosong!"}), 400
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("UPDATE penggajian SET bukti_tf=%s WHERE id_penggajian=%s", (bukti_tf, id_payroll))
        return jsonify({"status": "success", "message": "Bukti transfer berhasil disimpan ke database."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll/<int:id_payroll>/bukti', methods=['DELETE'])
@role_required('manager')
def delete_bukti_payroll(id_payroll):
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("UPDATE penggajian SET bukti_tf=NULL WHERE id_penggajian=%s", (id_payroll,))
        return jsonify({"status": "success", "message": "Bukti transfer berhasil dihapus."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@payroll_bp.route('/api/payroll/<int:id_payroll>/send-email', methods=['POST'])
@role_required('manager')
def send_slip_email(id_payroll):
    success, message = _send_slip_email(id_payroll)
    if success:
        return jsonify({"status": "success", "message": message}), 200
    return jsonify({"status": "error", "message": message}), 500

