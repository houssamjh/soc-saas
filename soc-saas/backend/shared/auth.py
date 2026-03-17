"""
JWT authentication middleware shared across all SOC microservices.
In development mode, authentication is bypassed.
In production, configure KEYCLOAK_PUBLIC_KEY to validate tokens.
"""
import os
import logging
from typing import Optional
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
DEV_MODE = os.getenv("DEV_MODE", "true").lower() == "true"


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Optional[dict]:
    """
    Get current user from JWT token.
    In dev mode, returns a default user if no token is provided.
    """
    if DEV_MODE:
        if not credentials:
            return {"sub": "dev-user", "email": "dev@soc.local", "role": "admin"}

    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return decode_token(credentials.credentials)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Require admin role."""
    if user.get("role") not in ("admin", "soc-admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
