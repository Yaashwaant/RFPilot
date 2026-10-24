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
    FirebaseAuthRequest,
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


# ─── Firebase ID Token Verification ─────────────────────────────────────────

_firebase_initialized = False


def _ensure_firebase_app():
    global _firebase_initialized
    if _firebase_initialized:
        return
    import json
    import os
    import firebase_admin
    from firebase_admin import credentials

    if firebase_admin._apps:
        _firebase_initialized = True
        return

    # 1. Inline JSON service account from environment
    sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or settings.FIREBASE_SERVICE_ACCOUNT_JSON
    if sa_json:
        try:
            cred_dict = json.loads(sa_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            return
        except Exception:
            pass

    # 2. Individual credentials from environment
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL") or settings.FIREBASE_CLIENT_EMAIL
    private_key = os.getenv("FIREBASE_PRIVATE_KEY") or settings.FIREBASE_PRIVATE_KEY
    project_id = os.getenv("FIREBASE_PROJECT_ID") or settings.FIREBASE_PROJECT_ID
    if client_email and private_key:
        try:
            formatted_key = private_key.replace("\\n", "\n")
            cred_dict = {
                "type": "service_account",
                "project_id": project_id,
                "private_key": formatted_key,
                "client_email": client_email,
                "token_uri": "https://oauth2.googleapis.com/token",
            }
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            return
        except Exception:
            pass

    # 3. File path to service account credentials
    cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH") or settings.FIREBASE_CREDENTIALS_PATH
    candidate_paths = [
        cred_path,
        os.path.join(os.getcwd(), cred_path) if cred_path else None,
        os.path.join(os.path.dirname(__file__), "..", "..", cred_path) if cred_path else None,
        os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api", cred_path) if cred_path else None,
    ]
    for p in candidate_paths:
        if p and os.path.exists(p):
            try:
                cred = credentials.Certificate(p)
                firebase_admin.initialize_app(cred)
                _firebase_initialized = True
                return
            except Exception:
                pass

    # 3. Project ID fallback
    project_id = os.getenv("FIREBASE_PROJECT_ID") or settings.FIREBASE_PROJECT_ID
    try:
        firebase_admin.initialize_app(options={"projectId": project_id})
        _firebase_initialized = True
    except Exception:
        pass


@router.post("/firebase", response_model=TokenResponse)
async def firebase_auth_endpoint(
    data: FirebaseAuthRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Authenticates or provisions a user using a verified Firebase ID token (JWT).
    Works interchangeably for Google Sign-In and Email/Password authenticated via Firebase.
    """
    _ensure_firebase_app()
    from firebase_admin import auth as fb_auth

    try:
        decoded_token = fb_auth.verify_id_token(data.idToken, clock_skew_seconds=10)
        email = decoded_token.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "NO_EMAIL", "message": "Firebase account must have an associated email."}},
            )
        name = decoded_token.get("name") or email.split("@")[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_FIREBASE_TOKEN", "message": f"Firebase verification failed: {str(e)}"}},
        )

    # Check if user already exists
    stmt = (
        select(AppUser)
        .options(selectinload(AppUser.workspace))
        .where(AppUser.email == email)
    )
    result = await db.execute(stmt)
    user = result.scalars().first()

    # If new user, create their workspace and AppUser record
    if not user:
        workspace = Workspace(name=f"{name}'s Workspace", plan="pro")
        db.add(workspace)
        await db.flush()

        user = AppUser(
            workspace_id=workspace.id,
            email=email,
            name=name,
            role="owner",
            password_hash=None,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.name and name:
        user.name = name
        await db.commit()
        await db.refresh(user)

    # Issue full RFPilot access token
    token = create_access_token(
        data={"sub": str(user.id), "workspace_id": str(user.workspace_id), "email": user.email},
        expires_delta=timedelta(days=7),
    )

    return TokenResponse(
        access_token=token,
        workspace_id=user.workspace_id,
        user_id=user.id,
        name=user.name or user.email,
        email=user.email,
    )

