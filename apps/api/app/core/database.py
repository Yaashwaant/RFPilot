"""
Proposal Assistant – Async Database Engine & Session Factory
Uses SQLAlchemy 2.0 async with asyncpg.
"""
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

import urllib.parse

db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

connect_args = {}
try:
    parsed = urllib.parse.urlsplit(db_url)
    if parsed.query:
        query_params = urllib.parse.parse_qs(parsed.query)
        sslmode = query_params.pop("sslmode", None)
        if sslmode:
            val = sslmode[0].lower()
            if val in ("require", "verify-ca", "verify-full"):
                connect_args["ssl"] = True
            elif val in ("disable", "prefer", "allow"):
                connect_args["ssl"] = False
        new_query = urllib.parse.urlencode(query_params, doseq=True)
        db_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
except Exception:
    pass

engine = create_async_engine(
    db_url,
    echo=settings.DEBUG,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    connect_args=connect_args,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all SQLAlchemy models."""
    pass


async def get_db_session() -> AsyncSession:
    """FastAPI dependency that yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


get_db = get_db_session
