"""
Proposal Assistant – Security Utilities
JWT creation/validation, password hashing, and ONLYOFFICE token signing.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()

# ─── Password Hashing (Argon2) ────────────────────────
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password using Argon2."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against an Argon2 hash."""
    return pwd_context.verify(plain, hashed)


# ─── JWT Tokens ────────────────────────────────────────
def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a signed JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Returns None on failure."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None


# ─── ONLYOFFICE JWT ───────────────────────────────────
def create_onlyoffice_token(payload: dict) -> str:
    """Create a JWT token for ONLYOFFICE Document Server authentication."""
    return jwt.encode(
        payload,
        settings.ONLYOFFICE_JWT_SECRET,
        algorithm="HS256",
    )


sign_onlyoffice_token = create_onlyoffice_token


def verify_onlyoffice_token(token: str) -> Optional[dict]:
    """Verify a JWT token from ONLYOFFICE callback requests."""
    try:
        return jwt.decode(
            token,
            settings.ONLYOFFICE_JWT_SECRET,
            algorithms=["HS256"],
        )
    except JWTError:
        return None
