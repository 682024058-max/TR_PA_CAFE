"""
middleware.py — Role guard decorator untuk semua blueprint.
"""
from flask import request, jsonify
from functools import wraps


def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            role = request.headers.get("X-User-Role", "").lower()
            if role not in roles:
                return jsonify({
                    "status": "error",
                    "message": f"Akses ditolak. Hanya {'/'.join(roles)} yang diizinkan."
                }), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator
