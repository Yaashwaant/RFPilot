"""
Proposal Assistant – Connectors Router
Exposes endpoints to list available enterprise connectors (Google Drive, Notion,
Confluence, SharePoint, Web, and Past RFP Workbooks), test connectivity, and trigger syncs into Mem0.
"""
from typing import Annotated, Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.connectors.manager import get_connector_manager
from app.core.dependencies import get_current_user
from app.models.models import AppUser

router = APIRouter()


class ConnectorTestRequest(BaseModel):
    config: Dict[str, Any] = Field(default_factory=dict)


class ConnectorSyncRequest(BaseModel):
    config: Dict[str, Any] = Field(default_factory=dict)
    projectId: Optional[UUID] = None


@router.get("", response_model=List[Dict[str, Any]])
async def list_connectors(
    current_user: Annotated[AppUser, Depends(get_current_user)],
):
    """Lists all available enterprise document and past RFP connectors."""
    manager = get_connector_manager()
    return manager.list_connectors()


@router.post("/{connector_id}/test")
async def test_connector(
    connector_id: str,
    payload: ConnectorTestRequest,
    current_user: Annotated[AppUser, Depends(get_current_user)],
):
    """Tests authentication and accessibility for an enterprise connector."""
    manager = get_connector_manager()
    success, message = await manager.test_connector(connector_id, payload.config)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "CONNECTION_TEST_FAILED", "message": message}},
        )
    return {"status": "SUCCESS", "message": message}


@router.post("/{connector_id}/sync")
async def sync_connector(
    connector_id: str,
    payload: ConnectorSyncRequest,
    current_user: Annotated[AppUser, Depends(get_current_user)],
):
    """Fetches documents from the remote source and ingests them into Mem0 persistent memory."""
    manager = get_connector_manager()
    project_str = str(payload.projectId) if payload.projectId else None
    user_str = str(current_user.id)

    try:
        result = await manager.sync_connector_to_mem0(
            connector_id=connector_id,
            config=payload.config,
            user_id=user_str,
            project_id=project_str,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "UNKNOWN_CONNECTOR", "message": str(e)}},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "SYNC_FAILED", "message": f"Ingestion error: {str(e)}"}},
        )


@router.post("/upload-past-rfp")
async def upload_past_rfp(
    file: UploadFile = File(...),
    projectId: Optional[UUID] = Form(None),
    current_user: Annotated[AppUser, Depends(get_current_user)] = None,
):
    """
    Directly uploads a past answered RFP workbook (.xlsx), extracts every
    approved requirement and response pair, and ingests them directly into Mem0.
    """
    filename = file.filename or "past_rfp.xlsx"
    if not (filename.lower().endswith(".xlsx") or filename.lower().endswith(".csv")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_FORMAT", "message": "Only .xlsx and .csv past RFP workbooks are supported."}},
        )

    content = await file.read()
    manager = get_connector_manager()
    project_str = str(projectId) if projectId else None
    user_str = str(current_user.id)

    result = await manager.ingest_past_rfp_excel(
        file_bytes=content,
        filename=filename,
        user_id=user_str,
        project_id=project_str,
    )

    return result
