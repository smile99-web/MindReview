import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from uuid import uuid4

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth_utils import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token_value,
    decode_access_token,
    hash_password,
    verify_password,
)
from database import close_pool, get_pool
from schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

security = HTTPBearer()


def row_to_user(row: asyncpg.Record) -> UserResponse:
    return UserResponse(
        id=row["id"],
        username=row["username"],
        email=row["email"],
        name=row["name"],
        grade=row["grade"],
        avatarUrl=row["avatarUrl"],
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserResponse:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT id, username, email, name, grade, "avatarUrl" FROM "User" WHERE id = $1',
            user_id,
        )

    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return row_to_user(row)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_pool()


app = FastAPI(title="MindReview Auth", version="1.0.0", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("AUTH_CORS_ORIGINS", "http://localhost:3000,http://localhost:3300").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/auth/health")
async def health():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(req: RegisterRequest):
    pool = await get_pool()

    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            'SELECT id FROM "User" WHERE username = $1',
            req.username,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )

        if req.email:
            existing_email = await conn.fetchrow(
                'SELECT id FROM "User" WHERE email = $1',
                req.email,
            )
            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already exists",
                )

        hashed = hash_password(req.password)
        now = datetime.utcnow()

        row = await conn.fetchrow(
            """
            INSERT INTO "User" (id, username, email, "passwordHash", name, grade, "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, username, email, name, grade, "avatarUrl"
            """,
            str(uuid4()),
            req.username,
            req.email,
            hashed,
            req.name,
            None,
            now,
        )

        refresh_value = create_refresh_token_value()
        expires = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await conn.execute(
            'INSERT INTO "RefreshToken" (id, token, "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
            str(uuid4()),
            refresh_value,
            row["id"],
            expires,
        )

        access_token = create_access_token({"sub": row["id"], "username": row["username"]})

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_value,
            user=row_to_user(row),
        )


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT id, username, email, name, grade, "avatarUrl", "passwordHash" FROM "User" WHERE username = $1',
            req.username,
        )
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        if not verify_password(req.password, row["passwordHash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
            )

        now = datetime.utcnow()

        await conn.execute(
            'DELETE FROM "RefreshToken" WHERE "userId" = $1 AND "expiresAt" < $2',
            row["id"],
            now,
        )

        refresh_value = create_refresh_token_value()
        expires = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await conn.execute(
            'INSERT INTO "RefreshToken" (id, token, "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
            str(uuid4()),
            refresh_value,
            row["id"],
            expires,
        )

        access_token = create_access_token({"sub": row["id"], "username": row["username"]})

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_value,
            user=row_to_user(row),
        )


@app.post("/api/auth/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshRequest):
    pool = await get_pool()
    now = datetime.utcnow()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT rt."userId", rt."expiresAt", u.id, u.username, u.email, u.name, u.grade, u."avatarUrl" '
            'FROM "RefreshToken" rt JOIN "User" u ON rt."userId" = u.id '
            "WHERE rt.token = $1",
            req.refresh_token,
        )

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        if row["expiresAt"] < now:
            await conn.execute('DELETE FROM "RefreshToken" WHERE token = $1', req.refresh_token)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token expired; please log in again",
            )

        await conn.execute('DELETE FROM "RefreshToken" WHERE token = $1', req.refresh_token)

        new_refresh = create_refresh_token_value()
        new_expires = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await conn.execute(
            'INSERT INTO "RefreshToken" (id, token, "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
            str(uuid4()),
            new_refresh,
            row["userId"],
            new_expires,
        )

        access_token = create_access_token({"sub": row["id"], "username": row["username"]})

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh,
            user=row_to_user(row),
        )


@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user)):
    return current_user
