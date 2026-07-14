
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template
from flask_cors import CORS
import os
import threading
import time
import calendar
from datetime import datetime, timedelta

import cloudinary
import cloudinary.uploader

app = Flask(__name__)
CORS(app)

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True
)

AUTO_REPORT_TIME = "00:00"

from routes.auth      import auth_bp
from routes.users     import users_bp
from routes.menu      import menu_bp
from routes.transaksi import transaksi_bp
from routes.absensi   import absensi_bp
from routes.laporan   import laporan_bp
from routes.payroll   import payroll_bp

app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(menu_bp)
app.register_blueprint(transaksi_bp)
app.register_blueprint(absensi_bp)
app.register_blueprint(laporan_bp)
app.register_blueprint(payroll_bp)

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

def init_payroll_table():
    from db import get_db
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
    except Exception as e:
        print("Gagal menginisialisasi tabel penggajian:", e)
    finally:
        if conn: conn.close()

def init_transaksi_table_migration():
    from db import get_db
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM transaksi LIKE 'bukti_tf'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE transaksi ADD COLUMN bukti_tf LONGTEXT DEFAULT NULL")
    except Exception as e:
        print("Gagal melakukan migrasi tabel transaksi:", e)
    finally:
        if conn: conn.close()

def init_absensi_migration():
    from db import get_db
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM absensi LIKE 'id_user'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE absensi ADD COLUMN id_user INT DEFAULT NULL")
                try:
                    cur.execute("ALTER TABLE absensi ADD CONSTRAINT fk_absensi_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE SET NULL")
                except Exception:
                    pass
                cur.execute("""
                    UPDATE absensi a
                    JOIN users u ON u.nama = a.nama_kasir AND u.role = 'kasir'
                    SET a.id_user = u.id_user
                    WHERE a.id_user IS NULL
                """)
                print("Kolom id_user berhasil ditambahkan ke tabel absensi dan data lama di-backfill.")
    except Exception as e:
        print("Gagal melakukan migrasi tabel absensi:", e)
    finally:
        if conn: conn.close()

last_sent_date  = None
last_sent_month = None

def run_auto_report_scheduler():
    global last_sent_date, last_sent_month
    from routes.laporan import build_sales_report_html, send_email_via_resend, get_manager_email

    while True:
        try:
            now               = datetime.now()
            current_time_str  = now.strftime("%H:%M")
            current_date_str  = now.strftime("%Y-%m-%d")
            current_month_str = now.strftime("%Y-%m")

            if current_time_str == AUTO_REPORT_TIME and last_sent_date != current_date_str:
                report_date = (now - timedelta(days=1)).strftime("%Y-%m-%d") if AUTO_REPORT_TIME == "00:00" else current_date_str
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scheduler harian aktif → {report_date}")
                recipient    = get_manager_email()
                subject      = f"Laporan Penjualan Harian - {report_date}"
                html_content = build_sales_report_html(report_date, report_date)
                if html_content:
                    if send_email_via_resend(recipient, subject, html_content):
                        last_sent_date = current_date_str
                        print(f"Laporan harian {report_date} sukses dikirim ke {recipient}.")
                    else:
                        print(f"Laporan harian {report_date} gagal dikirim. Dicoba lagi nanti.")
                else:
                    print("Laporan harian kosong atau DB tidak terbaca.")

            if current_time_str == "01:00" and now.day == 1 and last_sent_month != current_month_str:
                prev = (now.replace(day=1) - timedelta(days=1))
                prev_year, prev_month = prev.strftime("%Y"), prev.strftime("%m")
                last_day   = calendar.monthrange(int(prev_year), int(prev_month))[1]
                start_date = f"{prev_year}-{prev_month}-01"
                end_date   = f"{prev_year}-{prev_month}-{last_day:02d}"
                bulan_names = ["Januari","Februari","Maret","April","Mei","Juni",
                               "Juli","Agustus","September","Oktober","November","Desember"]
                bulan_label = f"{bulan_names[int(prev_month)-1]} {prev_year}"

                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scheduler bulanan aktif → {bulan_label}")
                recipient    = get_manager_email()
                subject      = f"Laporan Penjualan Bulanan — {bulan_label}"
                html_content = build_sales_report_html(start_date, end_date)
                if html_content:
                    if send_email_via_resend(recipient, subject, html_content):
                        last_sent_month = current_month_str
                        print(f"Laporan bulanan {bulan_label} sukses dikirim ke {recipient}.")
                    else:
                        print(f"Laporan bulanan {bulan_label} gagal dikirim. Dicoba lagi nanti.")
                else:
                    print("Laporan bulanan kosong atau DB tidak terbaca.")

            time.sleep(30)
        except Exception as e:
            print("Error di thread background scheduler:", e)
            time.sleep(30)

if __name__ == '__main__':
    init_payroll_table()
    init_transaksi_table_migration()
    init_absensi_migration()

    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not app.debug:
        scheduler_thread = threading.Thread(target=run_auto_report_scheduler, daemon=True)
        scheduler_thread.start()


    app.run(debug=True, port=5000)