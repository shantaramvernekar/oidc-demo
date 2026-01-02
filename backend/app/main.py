from __future__ import annotations

import os
import time
from typing import Any, Dict

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from jose import jwt
from jose.exceptions import JWTError

app = FastAPI(title="OIDC Demo API")


class CognitoConfig:
    def __init__(self) -> None:
        self.region = os.environ.get("COGNITO_REGION", "")
        self.user_pool_id = os.environ.get("COGNITO_USER_POOL_ID", "")
        self.client_id = os.environ.get("COGNITO_APP_CLIENT_ID", "")

        if not self.region or not self.user_pool_id or not self.client_id:
            raise ValueError(
                "Missing Cognito config. Set COGNITO_REGION, "
                "COGNITO_USER_POOL_ID, and COGNITO_APP_CLIENT_ID."
            )

    @property
    def issuer(self) -> str:
        return f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}"

    @property
    def jwks_url(self) -> str:
        return f"{self.issuer}/.well-known/jwks.json"


class JwksCache:
    def __init__(self, ttl_seconds: int = 3600) -> None:
        self.ttl_seconds = ttl_seconds
        self.cached_at = 0.0
        self.jwks: Dict[str, Any] | None = None

    async def get(self, url: str) -> Dict[str, Any]:
        now = time.time()
        if self.jwks and (now - self.cached_at) < self.ttl_seconds:
            return self.jwks

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            self.jwks = response.json()
            self.cached_at = now
            return self.jwks


jwks_cache = JwksCache()


async def verify_access_token(authorization: str | None = Header(None)) -> Dict[str, Any]:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    try:
        config = CognitoConfig()
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    jwks = await jwks_cache.get(config.jwks_url)

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token header") from exc

    key = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
    if not key:
        raise HTTPException(status_code=401, detail="Signing key not found")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=config.issuer,
            audience=config.client_id,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Token verification failed") from exc

    if claims.get("token_use") != "access":
        raise HTTPException(status_code=401, detail="Expected access token")

    return claims


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/profile")
async def profile(claims: Dict[str, Any] = Depends(verify_access_token)) -> Dict[str, Any]:
    return {
        "sub": claims.get("sub"),
        "email": claims.get("email"),
        "username": claims.get("username"),
        "groups": claims.get("cognito:groups", []),
    }


@app.get("/api/transactions")
async def transactions(claims: Dict[str, Any] = Depends(verify_access_token)) -> Dict[str, Any]:
    return {
        "owner": claims.get("sub"),
        "items": [
            {"id": "txn_001", "amount": 120.55, "category": "Groceries"},
            {"id": "txn_002", "amount": 48.2, "category": "Transport"},
        ],
    }


@app.get("/api/admin/reports")
async def admin_reports(claims: Dict[str, Any] = Depends(verify_access_token)) -> Dict[str, Any]:
    groups = claims.get("cognito:groups", [])
    if "admin" not in groups:
        raise HTTPException(status_code=403, detail="Admin access required")

    return {
        "generated_by": claims.get("username"),
        "summary": {
            "active_users": 42,
            "monthly_volume": 12345.67,
        },
    }
