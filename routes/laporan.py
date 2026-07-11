from flask import Blueprint, request, jsonify
from db import get_db, rows_to_json
from middleware import role_required
from datetime import date, datetime, timedelta
import os
import json
import urllib.request

laporan_bp = Blueprint('laporan', __name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "re_KaTaQNWQ_EJvAZLzSKgJE3nyiEUZHJ2Nx")
RESEND_SENDER  = os.environ.get("RESEND_SENDER", "Kopi Sibei <onboarding@resend.dev>")


def format_idr_py(val):
    return f"Rp {val:,.0f}".replace(",", ".")


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
    return "kepineliano@gmail.com"


def send_email_via_resend(recipient, subject, html_content, attachments=None):
    if not RESEND_API_KEY or RESEND_API_KEY.startswith("your-"):
        print("Resend API Key belum diisi. Pengiriman email dilewati (Mode Simulasi).")
        return False

    if "onboarding@resend.dev" in RESEND_SENDER:
        recipient = "kepineliano@gmail.com"

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
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
                    <div style="background-color: #4a3321; padding: 24px; text-align: center; color: #ffffff;">
                        <span style="font-size: 28px; display: block; margin-bottom: 6px;">☕</span>
                        <h2 style="margin: 0; font-weight: 700;">Laporan Penjualan Kopi Sibei</h2>
                        <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">Periode: {date_label}</p>
                    </div>
                    <div style="padding: 24px;">
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
                                    <td style="padding: 10px 8px; text-align: right; font-weight: bold;">{format_idr_py(info['amount'])}</td>
                                </tr>
                """
            html += """
                            </tbody>
                        </table>
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
                html += """<tr><td colspan="2" style="padding: 12px; text-align: center; color: #8e7c77; font-style: italic;">Tidak ada penjualan menu hari ini</td></tr>"""
            for menu in top_menus:
                html += f"""
                                <tr style="border-bottom: 1px solid #f5f2eb;">
                                    <td style="padding: 10px 8px;">{menu['nama_produk']}</td>
                                    <td style="padding: 10px 8px; text-align: right; font-weight: bold; color: #4a3321;">{menu['total_qty']} Porsi</td>
                                </tr>
                """
            html += f"""
                            </tbody>
                        </table>
                        <h3 style="border-bottom: 2px solid #f0e9df; padding-bottom: 6px; margin-top: 0; color: #4a3321;">Detil Transaksi</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background-color: #f5f2eb; border-bottom: 1px solid #e1dcd6;">
                                    <th style="text-align: left; padding: 8px; color: #8e7c77;">ID</th>
                                    <th style="text-align: left; padding: 8px; color: #8e7c77;">Kasir</th>
                                    <th style="text-align: center; padding: 8px; color: #8e7c77;">Metode</th>
                                    <th style="text-align: right; padding: 8px; color: #8e7c77;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
            """
            if not tx_details:
                html += """<tr><td colspan="4" style="padding: 12px; text-align: center; color: #8e7c77; font-style: italic;">Tidak ada transaksi hari ini</td></tr>"""
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
            html += """
                            </tbody>
                        </table>
                    </div>
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


# ── Routes ───────────────────────────────────────────────────

@laporan_bp.route('/api/laporan/harian', methods=['GET'])
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
        return jsonify({"status": "success", "data": rows_to_json(rows)}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        if conn: conn.close()


@laporan_bp.route('/api/report/email', methods=['POST'])
@role_required('manager')
def manual_email_report():
    data = request.get_json() or {}
    start_date = data.get('start_date')
    end_date   = data.get('end_date')
    recipient  = data.get('recipient_email')

    if not start_date or not end_date:
        today = date.today().isoformat()
        start_date = start_date or today
        end_date   = end_date or today

    if not recipient:
        recipient = get_manager_email()

    html_content = build_sales_report_html(start_date, end_date)
    if not html_content:
        return jsonify({"status": "error", "message": "Gagal menyusun laporan penjualan."}), 500

    subject = f"Laporan Penjualan Cafe ({start_date} s/d {end_date})"
    success = send_email_via_resend(recipient, subject, html_content)

    if success:
        return jsonify({"status": "success", "message": f"Laporan ({start_date} s/d {end_date}) berhasil dikirim ke {recipient}!"}), 200
    else:
        if not RESEND_API_KEY or RESEND_API_KEY.startswith("your-"):
            return jsonify({"status": "warning", "message": "Laporan berhasil dibuat! [MODE SIMULASI] Kredensial Resend API belum diisi."}), 200
        return jsonify({"status": "error", "message": "Gagal mengirimkan email via Resend API."}), 500


@laporan_bp.route('/api/cron/daily-report', methods=['GET', 'POST'])
def cron_daily_report():
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

    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    recipient  = get_manager_email()
    subject    = f"☕ [AUTO] Laporan Penjualan Harian - {yesterday}"
    html_content = build_sales_report_html(yesterday, yesterday)

    if html_content:
        success = send_email_via_resend(recipient, subject, html_content)
        if success:
            return jsonify({"status": "success", "message": f"Cron sukses mengirim laporan {yesterday} ke {recipient}."}), 200

    return jsonify({"status": "error", "message": "Gagal mengirim laporan otomatis."}), 500
