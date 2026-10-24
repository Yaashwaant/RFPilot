"""
Proposal Assistant – Object Storage Service
Wraps MinIO / S3 operations with local filesystem fallback for development resilience.
"""
import io
import os
from datetime import timedelta
from pathlib import Path
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings

settings = get_settings()

LOCAL_STORAGE_DIR = Path("/tmp/proposal_assistant_storage")
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class StorageService:
    """Wrapper around MinIO / S3 with automatic local disk fallback."""

    def __init__(self):
        self.minio_available = False
        provider = os.getenv("STORAGE_PROVIDER", "local").lower()
        if provider in ("s3", "minio"):
            try:
                self.client = Minio(
                    settings.MINIO_ENDPOINT,
                    access_key=settings.MINIO_ACCESS_KEY,
                    secret_key=settings.MINIO_SECRET_KEY,
                    secure=settings.MINIO_USE_SSL,
                )
                self.bucket = settings.MINIO_BUCKET
                if not self.client.bucket_exists(self.bucket):
                    self.client.make_bucket(self.bucket)
                self.minio_available = True
            except Exception:
                self.minio_available = False

    def upload_file(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Uploads a file to object storage or local fallback."""
        if self.minio_available:
            try:
                self.client.put_object(
                    self.bucket,
                    key,
                    io.BytesIO(data),
                    length=len(data),
                    content_type=content_type,
                )
                return key
            except Exception:
                pass

        # Fallback to local disk
        file_path = LOCAL_STORAGE_DIR / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(data)
        return key

    def download_file(self, key: str) -> bytes:
        """Downloads a file from object storage or local disk."""
        if self.minio_available:
            try:
                response = self.client.get_object(self.bucket, key)
                try:
                    return response.read()
                finally:
                    response.close()
                    response.release_conn()
            except Exception:
                pass

        file_path = LOCAL_STORAGE_DIR / key
        if file_path.exists():
            return file_path.read_bytes()
        raise FileNotFoundError(f"Storage key '{key}' not found.")

    def get_presigned_download_url(
        self,
        key: str,
        expires_seconds: int = 3600,
        response_filename: Optional[str] = None,
    ) -> str:
        """Generates a download URL for the file."""
        if self.minio_available:
            try:
                extra_query = {}
                if response_filename:
                    extra_query["response-content-disposition"] = (
                        f'attachment; filename="{response_filename}"'
                    )
                return self.client.presigned_get_object(
                    self.bucket,
                    key,
                    expires=timedelta(seconds=expires_seconds),
                    extra_query_params=extra_query if extra_query else None,
                )
            except Exception:
                pass

        # Return same-origin relative download URL
        return f"/api/storage/files/{key}"

    def delete_file(self, key: str) -> None:
        """Deletes a file from object storage or local disk."""
        if self.minio_available:
            try:
                self.client.remove_object(self.bucket, key)
                return
            except Exception:
                pass

        file_path = LOCAL_STORAGE_DIR / key
        if file_path.exists():
            file_path.unlink()


_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
