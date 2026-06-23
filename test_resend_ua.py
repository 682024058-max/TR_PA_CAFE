import os
import urllib.request
import json

# Load .env
base_dir = r"c:\Users\Acer\Downloads\Cafe"
env_path = os.path.join(base_dir, ".env")
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip().strip("'").strip('"')

api_key = os.environ.get("RESEND_API_KEY")
sender = os.environ.get("EMAIL_FROM", "onboarding@resend.dev")

print("Using API KEY:", api_key)
print("Using Sender:", sender)

url = "https://api.resend.com/emails"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}
payload = {
    "from": "Kopi Sibei <onboarding@resend.dev>",
    "to": ["kepineliano@gmail.com"],
    "subject": "Test Resend API with UA",
    "html": "<h1>Test Successful</h1>"
}

try:
    req = urllib.request.Request(
        url, 
        data=json.dumps(payload).encode('utf-8'), 
        headers=headers, 
        method='POST'
    )
    with urllib.request.urlopen(req) as response:
        print("Success! Status:", response.status)
        print("Response:", response.read().decode('utf-8'))
except Exception as e:
    print("Failed with error:", e)
    if hasattr(e, 'read'):
        print("Detail:", e.read().decode('utf-8'))
