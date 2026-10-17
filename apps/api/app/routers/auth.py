"""
Proposal Assistant – Authentication Router
Handles user registration, login, JWT token issuance, and current session inspection.
"""
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import AppUser, Workspace
from app.schemas.auth_dto import (
    CurrentUserResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
)

router = APIRouter()
settings = get_settings()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: Annotated[AsyncSession, Depends(get_db)]):
    """Register a new user and create an initial workspace for them."""
    # Check if user already exists
    existing = await db.execute(select(AppUser).where(AppUser.email == data.email))
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "USER_EXISTS", "message": "Email is already registered."}},
        )

    # Create workspace
    workspace_name = data.workspaceName or f"{data.name}'s Workspace"
    workspace = Workspace(name=workspace_name, plan="pro")
    db.add(workspace)
    await db.flush()

    # Create user
    user = AppUser(
        workspace_id=workspace.id,
        email=data.email,
        name=data.name,
        role="owner",
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        data={"sub": str(user.id), "workspace_id": str(workspace.id), "email": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return TokenResponse(
        access_token=token,
        workspace_id=workspace.id,
        user_id=user.id,
        name=user.name or user.email,
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: Annotated[AsyncSession, Depends(get_db)]):
    """Authenticate with email and password to receive a JWT access token."""
    stmt = (
        select(AppUser)
        .options(selectinload(AppUser.workspace))
        .where(AppUser.email == data.email)
    )
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Incorrect email or password."}},
        )

    token = create_access_token(
        data={"sub": str(user.id), "workspace_id": str(user.workspace_id), "email": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return TokenResponse(
        access_token=token,
        workspace_id=user.workspace_id,
        user_id=user.id,
        name=user.name or user.email,
        email=user.email,
    )


@router.get("/me", response_model=CurrentUserResponse)
async def get_me(current_user: Annotated[AppUser, Depends(get_current_user)]):
    """Get the current authenticated user profile and active workspace."""
    return CurrentUserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        workspace_id=current_user.workspace_id,
        workspace_name=current_user.workspace.name if current_user.workspace else "Workspace",
    )


@router.post("/seed-dev", response_model=TokenResponse)
async def seed_dev(db: Annotated[AsyncSession, Depends(get_db)]):
    """Convenience development seed endpoint to create or fetch a demo user."""
    demo_email = "demo@proposalassistant.ai"
    stmt = (
        select(AppUser)
        .options(selectinload(AppUser.workspace))
        .where(AppUser.email == demo_email)
    )
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user:
        workspace = Workspace(name="Acme Bid Team", plan="enterprise")
        db.add(workspace)
        await db.flush()

        user = AppUser(
            workspace_id=workspace.id,
            email=demo_email,
            name="Demo Lead",
            role="owner",
            password_hash=hash_password("password123"),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(
        data={"sub": str(user.id), "workspace_id": str(user.workspace_id), "email": user.email},
        expires_delta=timedelta(days=7),
    )

    return TokenResponse(
        access_token=token,
        workspace_id=user.workspace_id,
        user_id=user.id,
        name=user.name or "Demo Lead",
        email=user.email,
    )
