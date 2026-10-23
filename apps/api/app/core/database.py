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

import logging
import os
import socket
import ssl
import urllib.parse
from pathlib import Path

logger = logging.getLogger(__name__)

db_url = (settings.DATABASE_URL or "").strip()


def _is_port_open(host: str, port: int, timeout_sec: float = 0.25) -> bool:
    """Fast socket check to see if a local port is actually accepting connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout_sec):
            return True
    except (OSError, ConnectionRefusedError, TimeoutError):
        return False


def _build_sqlite_engine():
    """Builds an embedded SQLite async engine."""
    sqlite_dir = Path("/tmp/rfpilot_data")
    sqlite_dir.mkdir(parents=True, exist_ok=True)
    sqlite_url = f"sqlite+aiosqlite:///{sqlite_dir}/rfpilot.db"
    eng = create_async_engine(
        sqlite_url,
        echo=settings.DEBUG,
        pool_pre_ping=True,
    )
    fac = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    return eng, fac, sqlite_url


# Determine if we should use SQLite immediately
use_sqlite = False

if not db_url or db_url.startswith("sqlite"):
    use_sqlite = True
elif "localhost:5432" in db_url or "127.0.0.1:5432" in db_url:
    # If pointed to local postgres, verify if local postgres is actually running
    if not _is_port_open("127.0.0.1", 5432):
        logger.info("Local PostgreSQL (5432) is not responding; falling back to embedded SQLite.")
        use_sqlite = True

if use_sqlite:
    engine, async_session_factory, active_db_url = _build_sqlite_engine()
    logger.info("Using embedded SQLite database at: %s", active_db_url)
else:
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    connect_args = {"timeout": 10}
    try:
        parsed = urllib.parse.urlsplit(db_url)
        if parsed.query:
            query_params = urllib.parse.parse_qs(parsed.query)
            sslmode = query_params.pop("sslmode", None)
            if sslmode:
                val = sslmode[0].lower()
                if val in ("require", "verify-ca", "verify-full"):
                    ssl_ctx = ssl.create_default_context()
                    ssl_ctx.check_hostname = False
                    ssl_ctx.verify_mode = ssl.CERT_NONE
                    connect_args["ssl"] = ssl_ctx
                elif val in ("disable", "prefer", "allow"):
                    connect_args["ssl"] = False
            new_query = urllib.parse.urlencode(query_params, doseq=True)
            db_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
    except Exception:
        pass

    engine_kwargs = {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "connect_args": connect_args,
    }

    engine = create_async_engine(
        db_url,
        echo=settings.DEBUG,
        **engine_kwargs,
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
    global engine, async_session_factory, use_sqlite
    try:
        async with async_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
    except Exception as err:
        # If external postgres failed and we are not on SQLite yet, failover to SQLite
        if not use_sqlite:
            logger.warning("External DB error: %s. Activating embedded SQLite failover...", err)
            engine, async_session_factory, _ = _build_sqlite_engine()
            use_sqlite = True
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            async with async_session_factory() as session:
                try:
                    yield session
                    await session.commit()
                except Exception:
                    await session.rollback()
                    raise
                finally:
                    await session.close()
        else:
            raise


get_db = get_db_session

