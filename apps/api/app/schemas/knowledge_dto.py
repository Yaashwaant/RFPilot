"""
Proposal Assistant – Knowledge Base Pydantic Schemas (DTOs)
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class KnowledgeDocResponse(BaseModel):
    id: UUID
    name: str
    status: str = Field(..., description="UPLOADED | PROCESSING | READY | FAILED")
    mimeType: Optional[str] = None
    chunkCount: int = 0
    error: Optional[str] = None
    uploadedAt: datetime
