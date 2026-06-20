from werkzeug.security import generate_password_hash, check_password_hash

def hash_password(password):
    """
    Menghasilkan hash aman untuk kata sandi menggunakan Werkzeug.
    """
    if not password:
        return ""
    return generate_password_hash(password)

def verify_password(hashed_password, plaintext_password):
    """
    Memverifikasi kata sandi dengan hash pendukung.
    Mengembalikan tuple: (is_correct, needs_upgrade)
    
    - is_correct: True jika password cocok (baik via hash maupun plaintext fallback)
    - needs_upgrade: True jika cocok tapi password di database masih berupa teks biasa (plaintext)
    """
    if not hashed_password or not plaintext_password:
        return False, False
        
    try:
        is_correct = check_password_hash(hashed_password, plaintext_password)
        return is_correct, False
    except Exception:
        # Fallback jika password di DB masih berupa teks biasa (plaintext)
        is_correct = (hashed_password == plaintext_password)
        return is_correct, is_correct
