from werkzeug.security import generate_password_hash, check_password_hash

def hash_password(password):

    if not password:
        return ""
    return generate_password_hash(password)

def verify_password(hashed_password, plaintext_password):

    if not hashed_password or not plaintext_password:
        return False, False
        
    is_hash = ":" in hashed_password
    
    if is_hash:
        try:
            if check_password_hash(hashed_password, plaintext_password):
                return True, False
        except Exception:
            pass
            
    is_correct = (hashed_password == plaintext_password)
    needs_upgrade = is_correct and not is_hash
    return is_correct, needs_upgrade