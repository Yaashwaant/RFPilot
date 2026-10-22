"""
Proposal Assistant – Jobs & Streaming Router
Handles asynchronous job creation, cancellation, and Server-Sent Events (SSE) token streaming.
"""
import asyncio
import json
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.models.models import Answer, AnswerJob, AppUser, Project
from app.rag.generator import stream_grounded_answer
from app.rag.reranker import rerank_and_filter
from app.rag.retriever import hybrid_retrieve
from app.schemas.job_dto import (
    AnswerSummary,
    JobCreate,
    JobResponse,
    JobStatusResponse,
    SourceItem,
)

router = APIRouter()
settings = get_settings()


@router.post("/projects/{project_id}/jobs", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_job(
    project_id: UUID,
    payload: JobCreate,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Enqueues a new asynchronous answer generation job for a spreadsheet question."""
    # Verify project exists and belongs to current workspace
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

    job = AnswerJob(
        project_id=project_id,
        workspace_id=current_user.workspace_id,
        question_text=payload.questionText,
        question_anchor=payload.questionAnchor.model_dump(),
        answer_anchor=payload.answerAnchor.model_dump(),
        context=payload.context.model_dump() if payload.context else {},
        options=payload.options.model_dump() if payload.options else {},
        status="QUEUED",
        created_by=current_user.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    return JobResponse(jobId=job.id, status=job.status)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Returns the current or finalized status of an answer job (used for recovery/reconnect)."""
    stmt = (
        select(AnswerJob)
        .options(selectinload(AnswerJob.answers))
        .where(
            AnswerJob.id == job_id,
            AnswerJob.workspace_id == current_user.workspace_id,
        )
    )
    result = await db.execute(stmt)
    job = result.scalars().first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": "Job not found."}},
        )

    answer_summary = None
    if job.answers:
        latest_ans = sorted(job.answers, key=lambda a: a.version, reverse=True)[0]
        sources_list = [SourceItem(**s) for s in (latest_ans.sources or [])]
        answer_summary = AnswerSummary(
            id=latest_ans.id,
            text=latest_ans.text,
            sources=sources_list,
            confidence=latest_ans.confidence,
            status=latest_ans.status,
            truncated=latest_ans.truncated,
        )

    return JobStatusResponse(
        id=job.id,
        status=job.status,
        answer=answer_summary,
        errorCode=job.error_code,
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: UUID,
    current_user: Annotated[AppUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cancels an in-flight answer generation job."""
    stmt = select(AnswerJob).where(
        AnswerJob.id == job_id,
        AnswerJob.workspace_id == current_user.workspace_id,
    )
    result = await db.execute(stmt)
    job = result.scalars().first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": "Job not found."}},
        )

    job.status = "CANCELLED"
    await db.commit()
    return {"status": "CANCELLED"}


@router.get("/jobs/{job_id}/stream")
async def stream_job(
    job_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Server-Sent Events (SSE) streaming endpoint.
    Relays token chunks, source citations, heartbeats, and completion events.
    """
    stmt = select(AnswerJob).where(AnswerJob.id == job_id)
    result = await db.execute(stmt)
    job = result.scalars().first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": "Job not found."}},
        )

    async def sse_event_generator():
        # Update job status to RUNNING
        job.status = "RUNNING"
        await db.commit()

        # Step 1: Send initial heartbeat
        yield f"event: heartbeat\ndata: {json.dumps({'ts': int(datetime.now(timezone.utc).timestamp())})}\n\n"

        # Step 2: Retrieve relevant collateral (including continuous institutional memories from Mem0)
        candidates = await hybrid_retrieve(
            workspace_id=job.workspace_id,
            query=job.question_text,
            db=db,
            user_id=job.created_by,
            project_id=job.project_id,
        )
        passages, confidence, has_source = await rerank_and_filter(candidates, question=job.question_text)

        if not has_source:
            # Enforce zero-hallucination guardrail
            job.status = "NO_SOURCE"
            job.error_code = "NO_SOURCE"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            yield f"event: error\ndata: {json.dumps({'code': 'NO_SOURCE', 'message': 'No verified knowledge base collateral found to substantiate an accurate answer.'})}\n\n"
            return

        # Step 3: Stream sources event
        sources_payload = {
            "items": [
                {
                    "doc": p["doc"],
                    "section": p["section"],
                    "snippet": p["snippet"],
                    "score": p["score"],
                }
                for p in passages
            ]
        }
        yield f"event: sources\ndata: {json.dumps(sources_payload)}\n\n"

        # Step 4: Stream tokens
        full_text_chunks = []
        char_limit = (job.context or {}).get("charLimit")
        section_label = (job.context or {}).get("sectionLabel")

        async for token in stream_grounded_answer(
            question=job.question_text,
            passages=passages,
            char_limit=char_limit,
            section_label=section_label,
        ):
            full_text_chunks.append(token)
            yield f"event: token\ndata: {json.dumps({'t': token})}\n\n"

        final_text = "".join(full_text_chunks)
        is_truncated = bool(char_limit and len(final_text) >= char_limit)

        # Step 5: Save Answer record to database
        answer = Answer(
            job_id=job.id,
            project_id=job.project_id,
            workspace_id=job.workspace_id,
            answer_anchor=job.answer_anchor,
            version=1,
            text=final_text,
            sources=sources_payload["items"],
            confidence=confidence,
            status="DRAFT",
            truncated=is_truncated,
        )
        db.add(answer)

        job.status = "DONE"
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(answer)

        # Step 6: Dispatch done event
        done_payload = {
            "answerId": str(answer.id),
            "status": "OK",
            "confidence": confidence,
            "truncated": is_truncated,
        }
        yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
