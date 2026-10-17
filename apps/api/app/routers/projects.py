"""
Proposal Assistant – Projects Router
Handles RFP document uploads, project listing, ONLYOFFICE editor configuration, and exports.
"""
import time
import uuid
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.security import sign_onlyoffice_token
from app.core.storage import get_storage_service
from app.models.models import Answer, AppUser, Project
from app.schemas.project_dto import (
    EditorConfig,
    ExportResponse,
    ProjectCreateResponse,
    ProjectDetailResponse,
    ProjectListItem,
    UserInfo,
)

router = APIRouter()
settings = get_settings()
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB


@router.post("", response_model=ProjectCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    current_user: Annotated[AppUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """Uploads an Excel RFP workbook, stores it in object storage, and creates a project."""
    filename = file.filename or "proposal.xlsx"
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_FILE_TYPE", "message": "Only .xlsx workbooks are supported in MVP."}},
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "FILE_TOO_LARGE", "message": "File exceeds maximum size of 25 MB."}},
        )

    project_id = uuid.uuid4()
    workspace_id = current_user.workspace_id
    project_name = name.strip() if name and name.strip() else filename

    original_key = f"{workspace_id}/originals/{project_id}.xlsx"
    working_key = f"{workspace_id}/working/{project_id}.xlsx"
    editor_doc_key = f"{project_id}_v1_{int(time.time())}"

    # Store files in MinIO / S3
    storage = get_storage_service()
    storage.upload_file(
        original_key,
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    storage.upload_file(
        working_key,
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    # Insert Project DB record
    project = Project(
        id=project_id,
        workspace_id=workspace_id,
        name=project_name,
        file_type="xlsx",
        original_key=original_key,
        working_key=working_key,
        editor_doc_key=editor_doc_key,
        status="active",
        created_by=current_user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return ProjectCreateResponse(
        id=project.id,
        name=project.name,
        fileType=project.file_type,
        status=project.status,
    )


@router.get("", response_model=List[ProjectListItem])
async def list_projects(
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Lists all active projects for the current workspace with stats."""
    stmt = (
        select(Project)
        .where(
            Project.workspace_id == current_user.workspace_id,
            Project.status == "active",
        )
        .order_by(Project.updated_at.desc())
    )
    result = await db.execute(stmt)
    projects = result.scalars().all()

    items = []
    for p in projects:
        # Get count of answers
        ans_stmt = select(
            func.count(Answer.id).label("total"),
            func.count(Answer.id).filter(Answer.status == "DRAFT").label("unreviewed"),
        ).where(Answer.project_id == p.id)
        ans_res = await db.execute(ans_stmt)
        total_ans, unreviewed = ans_res.one()

        items.append(
            ProjectListItem(
                id=p.id,
                name=p.name,
                fileType=p.file_type,
                status=p.status,
                filledCount=total_ans or 0,
                unreviewedCount=unreviewed or 0,
                createdAt=p.created_at,
                updatedAt=p.updated_at,
            )
        )

    return items


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Returns project details and complete ONLYOFFICE initialization config."""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.workspace_id == current_user.workspace_id,
        Project.status != "deleted",
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found."}},
        )

    storage = get_storage_service()
    # Presigned URL for ONLYOFFICE to fetch the working spreadsheet
    file_url = storage.get_presigned_download_url(project.working_key, expires_seconds=3600)
    callback_url = f"{settings.CALLBACK_URL}?projectId={project.id}"

    # Sign JWT for ONLYOFFICE
    editor_jwt_payload = {
        "document": {
            "fileType": "xlsx",
            "key": project.editor_doc_key,
            "title": project.name,
            "url": file_url,
        },
        "editorConfig": {
            "callbackUrl": callback_url,
            "user": {
                "id": str(current_user.id),
                "name": current_user.name or current_user.email,
            },
            "customization": {
                "autosave": True,
                "forcesave": True,
            },
        },
    }
    jwt_token = sign_onlyoffice_token(editor_jwt_payload)

    editor_config = EditorConfig(
        documentServerUrl=settings.ONLYOFFICE_URL,
        documentType="cell",
        docKey=project.editor_doc_key,
        fileUrl=file_url,
        callbackUrl=callback_url,
        jwtToken=jwt_token,
        user=UserInfo(
            id=str(current_user.id),
            name=current_user.name or current_user.email,
        ),
    )

    return ProjectDetailResponse(
        id=project.id,
        name=project.name,
        status=project.status,
        editorConfig=editor_config,
    )


@router.get("/{project_id}/export", response_model=ExportResponse)
async def export_project(
    project_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    keepTint: bool = Query(False, description="Whether to retain AI draft tinting in exported file"),
):
    """Generates a signed download URL for the filled workbook."""
    stmt = select(Project).where(
        Project.id == project_id,
        Project.workspace_id == current_user.workspace_id,
    )
    result = await db.execute(stmt)
    project = result.scalars().first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found."}},
        )

    # Count unreviewed drafts
    count_stmt = select(func.count(Answer.id)).where(
        Answer.project_id == project.id,
        Answer.status == "DRAFT",
    )
    unreviewed_res = await db.execute(count_stmt)
    unreviewed_count = unreviewed_res.scalar_one() or 0

    base_name = project.name.rsplit(".", 1)[0]
    export_filename = f"{base_name}_filled.xlsx"

    storage = get_storage_service()
    download_url = storage.get_presigned_download_url(
        project.working_key,
        expires_seconds=7200,
        response_filename=export_filename,
    )

    return ExportResponse(
        downloadUrl=download_url,
        fileName=export_filename,
        unreviewedDraftsCount=unreviewed_count,
    )


@router.get("/{project_id}/sheet-data")
async def get_project_sheet_data(
    project_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Parses and returns full sheet matrix, values, merges, and styles for the workbook."""
    import io
    import openpyxl
    from openpyxl.utils import get_column_letter

    stmt = select(Project).where(
        Project.id == project_id,
        Project.workspace_id == current_user.workspace_id,
    )
    result = await db.execute(stmt)
    project = result.scalars().first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found."}},
        )

    storage = get_storage_service()
    try:
        data = storage.download_file(project.working_key)
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "EXCEL_PARSE_ERROR", "message": f"Could not read workbook: {e}"}},
        )

    def format_color(color_obj):
        if not color_obj:
            return None
        try:
            rgb = getattr(color_obj, "rgb", None)
            if rgb and isinstance(rgb, str) and len(rgb) == 8 and rgb != "00000000":
                return f"#{rgb[2:]}"
            elif rgb and isinstance(rgb, str) and len(rgb) == 6:
                return f"#{rgb}"
            theme = getattr(color_obj, "theme", None)
            if theme == 0:
                return "#FFFFFF"
            elif theme == 1:
                return "#000000"
        except Exception:
            pass
        return None

    sheets_data = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        max_r = min(ws.max_row or 1, 120)
        max_c = min(ws.max_column or 1, 10)

        # Extract column widths
        col_widths = {}
        for c in range(1, max_c + 1):
            col_let = get_column_letter(c)
            cd = ws.column_dimensions.get(col_let)
            col_widths[col_let] = cd.width if (cd and cd.width) else None

        # Map merged cells
        merges_list = [str(m) for m in ws.merged_cells.ranges]
        merged_map = {}
        for m in ws.merged_cells.ranges:
            m_str = str(m)
            min_col, min_row, max_col_idx, max_row_idx = m.bounds
            for r in range(min_row, max_row_idx + 1):
                for c in range(min_col, max_col_idx + 1):
                    addr = f"{get_column_letter(c)}{r}"
                    merged_map[addr] = {
                        "range": m_str,
                        "is_origin": (r == min_row and c == min_col),
                    }

        rows_data = []
        for r in range(1, max_r + 1):
            cells = []
            has_any = False
            rd = ws.row_dimensions.get(r)
            row_height = rd.height if (rd and rd.height) else None

            for c in range(1, max_c + 1):
                col_let = get_column_letter(c)
                addr = f"{col_let}{r}"
                cell = ws.cell(r, c)
                val = cell.value
                val_str = str(val) if val is not None else ""
                if val_str:
                    has_any = True

                bg_color = None
                text_color = None
                is_bold = False
                font_size = 11.0
                align = "left"

                try:
                    if cell.fill and cell.fill.start_color:
                        bg_color = format_color(cell.fill.start_color)
                    if cell.font:
                        is_bold = bool(cell.font.bold)
                        text_color = format_color(cell.font.color)
                        if cell.font.size:
                            font_size = float(cell.font.size)
                    if cell.alignment and cell.alignment.horizontal:
                        align = cell.alignment.horizontal
                except Exception:
                    pass

                # If dark navy background, default foreground to white if not colored
                if bg_color and bg_color.upper() == "#002060" and not text_color:
                    text_color = "#FFFFFF"

                merge_info = merged_map.get(addr)

                cells.append({
                    "address": addr,
                    "col": col_let,
                    "row": r,
                    "value": val_str,
                    "bg_color": bg_color,
                    "text_color": text_color,
                    "bold": is_bold,
                    "font_size": font_size,
                    "align": align,
                    "merged_range": merge_info["range"] if merge_info else None,
                    "is_origin": merge_info["is_origin"] if merge_info else True,
                })

            rows_data.append({
                "row_num": r,
                "row_height": row_height,
                "cells": cells,
            })

        sheets_data.append({
            "name": sheet_name,
            "max_row": max_r,
            "max_col": max_c,
            "col_widths": col_widths,
            "merges": merges_list,
            "rows": rows_data,
        })

    return {
        "projectId": str(project.id),
        "projectName": project.name,
        "sheets": sheets_data,
    }
