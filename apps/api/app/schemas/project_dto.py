"""
Proposal Assistant – Project Pydantic Schemas (DTOs)
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class UserInfo(BaseModel):
    id: str
    name: str


class EditorConfig(BaseModel):
    documentServerUrl: str = Field(..., description="ONLYOFFICE Document Server base URL")
    documentType: str = Field("cell", description="ONLYOFFICE document type ('cell' for spreadsheets)")
    docKey: str = Field(..., description="Unique revision key for ONLYOFFICE caching")
    fileUrl: str = Field(..., description="Pre-signed download URL for editor to fetch file")
    callbackUrl: str = Field(..., description="POST webhook endpoint for ONLYOFFICE save calls")
    jwtToken: str = Field(..., description="Signed JWT token validating configuration")
    user: UserInfo


class ProjectCreateResponse(BaseModel):
    id: UUID
    name: str
    fileType: str = "xlsx"
    status: str = "active"


class ProjectListItem(BaseModel):
    id: UUID
    name: str
    fileType: str = "xlsx"
    status: str = "active"
    filledCount: int = 0
    unreviewedCount: int = 0
    createdAt: datetime
    updatedAt: datetime


class ProjectDetailResponse(BaseModel):
    id: UUID
    name: str
    status: str = "active"
    editorConfig: EditorConfig


class ExportResponse(BaseModel):
    downloadUrl: str
    fileName: str
    unreviewedDraftsCount: int = 0
