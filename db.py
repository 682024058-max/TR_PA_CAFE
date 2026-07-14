
import os
import urllib.parse
import pymysql
import pymysql.cursors
import decimal
from datetime import date, datetime, timedelta

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

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    try:
        url_str = DATABASE_URL
        if url_str.startswith("mysql+pymysql://"):
            url_str = url_str.replace("mysql+pymysql://", "mysql://", 1)
        parsed = urllib.parse.urlparse(url_str)
        DB_HOST     = parsed.hostname or "localhost"
        DB_USER     = parsed.username or "root"
        DB_PASSWORD = parsed.password or ""
        DB_PORT     = parsed.port or 4000
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