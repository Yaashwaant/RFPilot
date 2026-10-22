"""
Proposal Assistant – Mem0 Memory Router
Exposes endpoints to view, search, add, and manage continuous learning memories.
"""
from typing import Annotated, Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user
from app.models.models import AppUser
from app.services.memory_service import get_memory_service

router = APIRouter()


class MemoryItemResponse(BaseModel):
    id: str
    memory: str
    score: Optional[float] = None
    createdAt: Optional[str] = Field(None, alias="created_at")
    metadata: Dict[str, Any] = {}

    model_config = {"populate_by_name": True}


class MemoryCreateRequest(BaseModel):
    text: str = Field(..., min_length=2, description="Fact, rule, or statement to memorize.")
    projectId: Optional[UUID] = Field(None, description="Optional project ID to associate memory with.")
    metadata: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Semantic search query.")
    projectId: Optional[UUID] = None
    limit: int = Field(5, ge=1, le=20)


@router.get("", response_model=List[MemoryItemResponse])
async def list_memories(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    projectId: Optional[UUID] = Query(None, description="Filter by project ID"),
    limit: int = Query(50, ge=1, le=100),
):
    """Lists continuous learning memories associated with the current user or project."""
    ms = get_memory_service()
    if not ms.is_available:
        return []

    project_str = str(projectId) if projectId else None
    user_str = str(current_user.id)
    items = await ms.get_all_memories(user_id=user_str, project_id=project_str, limit=limit)
    return [MemoryItemResponse(**item) for item in items]


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_memory(
    payload: MemoryCreateRequest,
    current_user: Annotated[AppUser, Depends(get_current_user)],
):
    """Manually stores a new organizational fact, policy, or accepted RFP rule."""
    ms = get_memory_service()
    if not ms.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "MEMORY_DISABLED", "message": "Mem0 memory service is not enabled."}},
        )

    project_str = str(payload.projectId) if payload.projectId else None
    user_str = str(current_user.id)

    res = await ms.add_memory(
        messages_or_text=payload.text,
        user_id=user_str,
        project_id=project_str,
        metadata=payload.metadata,
    )

    if not res:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "MEMORY_SAVE_FAILED", "message": "Failed to persist memory."}},
        )

    return {"status": "SUCCESS", "result": res}


@router.post("/search", response_model=List[MemoryItemResponse])
async def search_memories(
    payload: MemorySearchRequest,
    current_user: Annotated[AppUser, Depends(get_current_user)],
):
    """Executes semantic similarity search over institutional memories."""
    ms = get_memory_service()
    if not ms.is_available:
        return []

    project_str = str(payload.projectId) if payload.projectId else None
    user_str = str(current_user.id)

    results = await ms.search_memory(
        query=payload.query,
        user_id=user_str,
        project_id=project_str,
        limit=payload.limit,
    )
    return [MemoryItemResponse(**r) for r in results]


@router.delete("/{memory_id}")
async def delete_memory(
    memory_id: str,
    current_user: Annotated[AppUser, Depends(get_current_user)],
):
    """Removes a specific memory item from the vector store."""
    ms = get_memory_service()
    if not ms.is_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": {"code": "MEMORY_DISABLED", "message": "Mem0 memory service is not enabled."}},
        )

    success = await ms.delete_memory(memory_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "MEMORY_NOT_FOUND", "message": "Memory item not found or deletion failed."}},
        )

    return {"status": "DELETED", "memoryId": memory_id}
