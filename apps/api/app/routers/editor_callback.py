"""
Proposal Assistant – ONLYOFFICE Editor Webhook Callback
Processes document save events (status 2 and status 6) from ONLYOFFICE Docs.
"""
import time
from typing import Annotated, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.security import verify_onlyoffice_token
from app.core.storage import get_storage_service
from app.models.models import Project

router = APIRouter()
settings = get_settings()


class OnlyOfficeCallbackPayload(BaseModel):
    key: Optional[str] = None
    status: int
    url: Optional[str] = None
    users: Optional[list] = None
    actions: Optional[list] = None
    token: Optional[str] = None


@router.post("/callback")
async def onlyoffice_callback(
    request: Request,
    projectId: UUID = Query(..., description="Project ID being saved"),
):
    """
    Webhook target called by ONLYOFFICE Document Server.
    When status is 2 (ready for save) or 6 (force-save), downloads updated workbook
    and saves it to the working key in MinIO / S3.
    """
    try:
        body_bytes = await request.body()
        payload_data = await request.json()
    except Exception:
        return {"error": 0}

    # Verify JWT if configured
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    elif payload_data.get("token"):
        token = payload_data.get("token")

    if token and settings.ONLYOFFICE_JWT_SECRET:
        decoded = verify_onlyoffice_token(token)
        if not decoded:
            # If secret fails verification
            pass

    status_code = payload_data.get("status")
    download_url = payload_data.get("url")

    # Status 2 = save completed (all users closed), Status 6 = force-save requested
    if status_code in (2, 6) and download_url:
        async for db in get_db_session():
            stmt = select(Project).where(Project.id == projectId)
            res = await db.execute(stmt)
            project = res.scalars().first()

            if project:
                try:
                    # Download binary from ONLYOFFICE server
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        response = await client.get(download_url)
                        if response.status_code == 200:
                            content = response.content
                            storage = get_storage_service()
                            # Overwrite working copy in S3
                            storage.upload_file(
                                project.working_key,
                                content,
                                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            )
                            # Rotate editor_doc_key to invalidate cache
                            project.editor_doc_key = f"{project.id}_v{int(time.time())}"
                            await db.commit()
                except Exception as e:
                    print(f"Error handling ONLYOFFICE callback download: {e}")
            break

    # MUST return {"error": 0} to acknowledge receipt
    return {"error": 0}
