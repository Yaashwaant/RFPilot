"""
Proposal Assistant – Answer Pydantic Schemas (DTOs)
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.schemas.job_dto import CellAnchor, SourceItem


class AnswerPatch(BaseModel):
    status: Optional[str] = Field(
        None, description="'ACCEPTED' | 'EDITED' | 'REJECTED' | 'UNDONE'"
    )
    text: Optional[str] = Field(
        None, description="Updated text if user edited inside drawer"
    )


class AnswerResponse(BaseModel):
    id: UUID
    jobId: UUID
    projectId: UUID
    answerAnchor: CellAnchor
    version: int = 1
    text: str
    sources: List[SourceItem] = Field(default_factory=list)
    confidence: Optional[str] = None
    status: str = Field(..., description="DRAFT | ACCEPTED | EDITED | REJECTED | UNDONE")
    truncated: bool = False
    createdAt: datetime
