"""
Proposal Assistant – Auth & User Pydantic Schemas (DTOs)
"""
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)
    workspaceName: Optional[str] = "Default Workspace"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class FirebaseAuthRequest(BaseModel):
    idToken: str = Field(..., description="Firebase Auth ID Token (JWT) from client SDK.")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    workspace_id: UUID
    user_id: UUID
    name: str
    email: str


class CurrentUserResponse(BaseModel):
    id: UUID
    email: str
    name: Optional[str]
    role: str
    workspace_id: UUID
    workspace_name: str
