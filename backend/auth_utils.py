import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

DEV_JWT_SECRET = "mindreview-dev-secret-change-me"
INSECURE_PRODUCTION_SECRETS = {
    DEV_JWT_SECRET,
    "mindreview-jwt-secret-change-in-production",
}

SECRET_KEY = os.getenv("JWT_SECRET_KEY") or DEV_JWT_SECRET
if os.getenv("ENV") == "production" and SECRET_KEY in INSECURE_PRODUCTION_SECRETS:
    raise RuntimeError("JWT_SECRET_KEY must be set to a strong secret in production")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token_value() -> str:
    return secrets.token_urlsafe(64)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


class TokenPayload(BaseModel):
    sub: str
    username: str
