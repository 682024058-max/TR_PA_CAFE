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
        
    # Hash Werkzeug selalu memiliki pemisah titik dua (misal 'pbkdf2:sha256:...' atau 'scrypt:...')
    is_hash = ":" in hashed_password
    
    if is_hash:
        try:
            if check_password_hash(hashed_password, plaintext_password):
                return True, False
        except Exception:
            pass
            
    # Fallback jika password di DB masih berupa teks biasa (plaintext)
    is_correct = (hashed_password == plaintext_password)
    needs_upgrade = is_correct and not is_hash
    return is_correct, needs_upgrade
