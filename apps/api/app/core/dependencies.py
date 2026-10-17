"""
Proposal Assistant – FastAPI Dependencies
Provides database sessions, current user extraction, and workspace context.
"""
from typing import Annotated, AsyncGenerator, Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import decode_token
from app.models.models import AppUser, Workspace

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an async database session."""
    async for session in get_db_session():
        yield session


async def get_current_user_optional(
    token_creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Optional[AppUser]:
    """Decodes JWT and retrieves the AppUser, returns None if not authenticated."""
    if not token_creds or not token_creds.credentials:
        return None

    token = token_creds.credentials
    payload = decode_token(token)
    if not payload:
        return None

    user_id_str = payload.get("sub")
    if not user_id_str:
        return None

    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        return None

    stmt = (
        select(AppUser)
        .options(selectinload(AppUser.workspace))
        .where(AppUser.id == user_id)
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    return user


async def get_current_user(
    user: Annotated[Optional[AppUser], Depends(get_current_user_optional)],
) -> AppUser:
    """Enforces authentication; raises 401 Unauthorized if invalid or missing token."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Invalid or expired token."}},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
