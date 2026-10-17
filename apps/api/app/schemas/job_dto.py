"""
Proposal Assistant – Job Pydantic Schemas (DTOs)
"""
from typing import Any, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class CellAnchor(BaseModel):
    sheet: str = Field(..., description="Target sheet name in the workbook")
    address: str = Field(..., description="A1-style cell reference (e.g. C14)")
    mergedRange: Optional[str] = Field(
        None, description="Merged range envelope if cell is merged (e.g. C14:E14)"
    )


class JobContext(BaseModel):
    columnHeaders: Optional[List[str]] = Field(
        default_factory=list, description="Headers of surrounding columns"
    )
    sectionLabel: Optional[str] = Field(
        None, description="Section or category label from header rows"
    )
    neighbours: Optional[List[str]] = Field(
        default_factory=list, description="Adjacent context texts"
    )
    charLimit: Optional[int] = Field(
        None, description="Detected character limit from Excel data validation"
    )


class JobOptions(BaseModel):
    length: Optional[str] = Field("standard", description="standard | concise | detailed")
    tone: Optional[str] = Field("professional", description="professional | persuasive | technical")


class JobCreate(BaseModel):
    questionText: str = Field(..., min_length=1, description="Captured question prompt")
    questionAnchor: CellAnchor = Field(..., description="Coordinates of question cell")
    answerAnchor: CellAnchor = Field(..., description="Coordinates of target answer cell")
    context: Optional[JobContext] = Field(default_factory=JobContext)
    options: Optional[JobOptions] = Field(default_factory=JobOptions)


class JobResponse(BaseModel):
    jobId: UUID = Field(..., description="Unique ID of created Celery job")
    status: str = Field("QUEUED", description="Initial job status")


class SourceItem(BaseModel):
    doc: str = Field(..., description="Source document filename")
    section: Optional[str] = Field(None, description="Section heading")
    snippet: str = Field(..., description="Excerpt text used for grounding")
    score: float = Field(..., description="Relevance score (0.0 - 1.0)")


class AnswerSummary(BaseModel):
    id: UUID
    text: str
    sources: List[SourceItem] = Field(default_factory=list)
    confidence: Optional[str] = Field(None, description="HIGH | MEDIUM | LOW")
    status: str = Field("DRAFT", description="DRAFT | ACCEPTED | EDITED | REJECTED | UNDONE")
    truncated: bool = False


class JobStatusResponse(BaseModel):
    id: UUID
    status: str = Field(..., description="QUEUED | RUNNING | DONE | NO_SOURCE | FAILED | CANCELLED")
    answer: Optional[AnswerSummary] = None
    errorCode: Optional[str] = None
