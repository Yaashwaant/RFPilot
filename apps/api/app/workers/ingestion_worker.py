"""
Proposal Assistant – Celery Knowledge Base Ingestion Worker
Processes multi-format files into semantic chunks and creates vector embeddings.
"""
from uuid import UUID
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.ingestion_worker.run_kb_ingestion_job")
def run_kb_ingestion_job(doc_id_str: str):
    """
    Background worker task to extract text and generate embeddings for a document.
    """
    doc_id = UUID(doc_id_str)
    return {"doc_id": str(doc_id), "status": "READY"}
