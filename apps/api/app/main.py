"""
Proposal Assistant – FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import auth, projects, jobs, answers, knowledge, editor_callback, memory, connectors

settings = get_settings()


from fastapi.responses import Response
from app.core.database import engine, Base
from app.core.storage import get_storage_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown hooks."""
    # Startup
    print(f"🚀 {settings.APP_NAME} starting ({settings.ENVIRONMENT})", flush=True)
    try:
        import asyncio
        async def init_tables():
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        await asyncio.wait_for(init_tables(), timeout=5.0)
        print("✅ Database tables verified/initialized", flush=True)
    except Exception as e:
        print(f"⚠️ Database initialization note: {e}", flush=True)
    yield
    # Shutdown
    print(f"🛑 {settings.APP_NAME} shutting down", flush=True)


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered RFP proposal assistant with document upload and auto-fill",
    version="0.1.0",
    lifespan=lifespan,
)

# ─── CORS Middleware ───────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Next.js dev
        "http://localhost:8080",   # ONLYOFFICE
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(jobs.router, prefix="/api", tags=["jobs"])
app.include_router(answers.router, prefix="/api/answers", tags=["answers"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["connectors"])
app.include_router(editor_callback.router, prefix="/api/editor", tags=["editor"])


from pathlib import Path
from typing import Optional

@app.get("/api/storage/files/{file_path:path}")
async def serve_storage_file(file_path: str, filename: Optional[str] = None):
    """Fallback endpoint to serve uploaded working documents in local dev."""
    storage = get_storage_service()
    try:
        data = storage.download_file(file_path)
        dl_name = filename or Path(file_path).name
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{dl_name}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    except FileNotFoundError:
        return Response(status_code=404, content="File not found")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": settings.APP_NAME}
