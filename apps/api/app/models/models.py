"""
Proposal Assistant – SQLAlchemy Models
Maps directly to the PostgreSQL schema from LLD §3.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    BigInteger,
)
import os
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Gracefully support pgvector where available (Docker) and JSONB fallback in local dev
if os.getenv("USE_PGVECTOR", "0") in ("1", "true", "True"):
    try:
        from pgvector.sqlalchemy import Vector
        VectorType = Vector(1024)
    except ImportError:
        VectorType = JSONB
else:
    VectorType = JSONB


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


# ─── Workspace (Tenant Root) ──────────────────────────

class Workspace(Base):
    __tablename__ = "workspace"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    plan: Mapped[str] = mapped_column(Text, nullable=False, default="trial")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    # Relationships
    users: Mapped[list["AppUser"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")
    knowledge_docs: Mapped[list["KnowledgeDoc"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")


# ─── App User ─────────────────────────────────────────

class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        info={"check": "role IN ('owner', 'member', 'viewer')"},
    )
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint("role IN ('owner', 'member', 'viewer')", name="ck_user_role"),
        Index("idx_user_workspace", "workspace_id"),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(back_populates="users")


# ─── Project ──────────────────────────────────────────

class Project(Base):
    __tablename__ = "project"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(Text, nullable=False, default="xlsx")
    original_key: Mapped[str] = mapped_column(Text, nullable=False)
    working_key: Mapped[str] = mapped_column(Text, nullable=False)
    editor_doc_key: Mapped[str] = mapped_column(Text, nullable=False)
    keep_ai_tint_on_export: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived', 'deleted')", name="ck_project_status"),
        Index("idx_project_workspace", "workspace_id"),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(back_populates="projects")
    answer_jobs: Mapped[list["AnswerJob"]] = relationship(back_populates="project", cascade="all, delete-orphan")


# ─── Answer Job ───────────────────────────────────────

class AnswerJob(Base):
    __tablename__ = "answer_job"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_anchor: Mapped[dict] = mapped_column(JSONB, nullable=False)
    answer_anchor: Mapped[dict] = mapped_column(JSONB, nullable=False)
    context: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    options: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="QUEUED")
    error_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('QUEUED', 'RUNNING', 'DONE', 'NO_SOURCE', 'FAILED', 'CANCELLED')",
            name="ck_job_status",
        ),
        Index("idx_answer_job_project_created", "project_id", "created_at"),
        Index("idx_answer_job_workspace", "workspace_id"),
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="answer_jobs")
    answers: Mapped[list["Answer"]] = relationship(back_populates="job", cascade="all, delete-orphan")


# ─── Answer ───────────────────────────────────────────

class Answer(Base):
    __tablename__ = "answer"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("answer_job.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    answer_anchor: Mapped[dict] = mapped_column(JSONB, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    confidence: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="DRAFT")
    previous_value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('DRAFT', 'ACCEPTED', 'EDITED', 'REJECTED', 'UNDONE')",
            name="ck_answer_status",
        ),
        CheckConstraint(
            "confidence IN ('HIGH', 'MEDIUM', 'LOW') OR confidence IS NULL",
            name="ck_answer_confidence",
        ),
        Index("idx_answer_project_status", "project_id", "status"),
        Index("idx_answer_workspace", "workspace_id"),
    )

    # Relationships
    job: Mapped["AnswerJob"] = relationship(back_populates="answers")


# ─── Knowledge Document ──────────────────────────────

class KnowledgeDoc(Base):
    __tablename__ = "knowledge_doc"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    file_key: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="UPLOADED")
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('UPLOADED', 'PROCESSING', 'READY', 'FAILED')",
            name="ck_kbdoc_status",
        ),
        Index("idx_kb_doc_workspace", "workspace_id"),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(back_populates="knowledge_docs")
    chunks: Mapped[list["KBChunk"]] = relationship(back_populates="doc", cascade="all, delete-orphan")


# ─── Knowledge Base Chunk (Hybrid Search) ─────────────

class KBChunk(Base):
    __tablename__ = "kb_chunk"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    doc_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("knowledge_doc.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    section: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(VectorType, nullable=True)

    __table_args__ = (
        Index("idx_kb_chunk_workspace", "workspace_id"),
    )

    # Relationships
    doc: Mapped["KnowledgeDoc"] = relationship(back_populates="chunks")


# ─── Audit Event ──────────────────────────────────────

class AuditEvent(Base):
    __tablename__ = "audit_event"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="SET NULL"), nullable=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project.id", ondelete="CASCADE"), nullable=True
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    __table_args__ = (
        Index("idx_audit_workspace_created", "workspace_id", "created_at"),
    )
