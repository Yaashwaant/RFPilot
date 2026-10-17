"""
Proposal Assistant – Answers Router
Handles answer review actions (Accept, Undo, Edit, Reject), regeneration, and activity logs.
"""
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.models import Answer, AnswerJob, AppUser, Project
from app.schemas.answer_dto import AnswerPatch, AnswerResponse
from app.schemas.job_dto import CellAnchor, JobResponse, SourceItem

router = APIRouter()


@router.patch("/{answer_id}", response_model=AnswerResponse)
async def patch_answer(
    answer_id: UUID,
    payload: AnswerPatch,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Updates review status (ACCEPTED, EDITED, REJECTED, UNDONE) or edited text."""
    stmt = select(Answer).where(
        Answer.id == answer_id,
        Answer.workspace_id == current_user.workspace_id,
    )
    result = await db.execute(stmt)
    answer = result.scalars().first()

    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ANSWER_NOT_FOUND", "message": "Answer not found."}},
        )

    if payload.status:
        allowed = {"ACCEPTED", "EDITED", "REJECTED", "UNDONE"}
        if payload.status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "INVALID_STATUS", "message": f"Status must be one of {allowed}"}},
            )
        answer.status = payload.status

    if payload.text is not None:
        answer.text = payload.text
        if not payload.status:
            answer.status = "EDITED"

    await db.commit()
    await db.refresh(answer)

    sources_list = [SourceItem(**s) for s in (answer.sources or [])]
    return AnswerResponse(
        id=answer.id,
        jobId=answer.job_id,
        projectId=answer.project_id,
        answerAnchor=CellAnchor(**answer.answer_anchor),
        version=answer.version,
        text=answer.text,
        sources=sources_list,
        confidence=answer.confidence,
        status=answer.status,
        truncated=answer.truncated,
        createdAt=answer.created_at,
    )


@router.post("/{answer_id}/regenerate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def regenerate_answer(
    answer_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Spawns a fresh answer generation job using the original question and anchors."""
    stmt = select(Answer).where(
        Answer.id == answer_id,
        Answer.workspace_id == current_user.workspace_id,
    )
    result = await db.execute(stmt)
    answer = result.scalars().first()

    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ANSWER_NOT_FOUND", "message": "Answer not found."}},
        )

    # Fetch original job
    job_stmt = select(AnswerJob).where(AnswerJob.id == answer.job_id)
    job_res = await db.execute(job_stmt)
    orig_job = job_res.scalars().first()

    if not orig_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": "Original job not found."}},
        )

    # Create new job
    new_job = AnswerJob(
        project_id=answer.project_id,
        workspace_id=current_user.workspace_id,
        question_text=orig_job.question_text,
        question_anchor=orig_job.question_anchor,
        answer_anchor=orig_job.answer_anchor,
        context=orig_job.context,
        options=orig_job.options,
        status="QUEUED",
        created_by=current_user.id,
    )
    db.add(new_job)
    await db.commit()
    await db.refresh(new_job)

    return JobResponse(jobId=new_job.id, status=new_job.status)


@router.get("/project/{project_id}", response_model=List[AnswerResponse])
async def list_project_answers(
    project_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Lists all generated answers for a project to populate the Activity List."""
    stmt = (
        select(Answer)
        .where(
            Answer.project_id == project_id,
            Answer.workspace_id == current_user.workspace_id,
        )
        .order_by(Answer.created_at.desc())
    )
    result = await db.execute(stmt)
    answers = result.scalars().all()

    return [
        AnswerResponse(
            id=a.id,
            jobId=a.job_id,
            projectId=a.project_id,
            answerAnchor=CellAnchor(**a.answer_anchor),
            version=a.version,
            text=a.text,
            sources=[SourceItem(**s) for s in (a.sources or [])],
            confidence=a.confidence,
            status=a.status,
            truncated=a.truncated,
            createdAt=a.created_at,
        )
        for a in answers
    ]
