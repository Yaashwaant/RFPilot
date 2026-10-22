"""
Proposal Assistant – Google Drive & Docs Connector
Connects to Google Drive folders and files, downloads Google Docs, Sheets,
and uploaded collateral PDFs, and ingests them into Mem0.
"""
import io
import logging
from typing import Any, Dict, List, Tuple
import httpx
from pypdf import PdfReader

from app.connectors.base import BaseConnector, IngestedItem

logger = logging.getLogger(__name__)


class GoogleDriveConnector(BaseConnector):
    @property
    def id(self) -> str:
        return "google_drive"

    @property
    def name(self) -> str:
        return "Google Drive"

    @property
    def description(self) -> str:
        return "Ingests Google Docs, Sheets with past RFP responses, and shared collateral folders from Google Drive."

    @property
    def required_config_fields(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "access_token_or_key",
                "label": "Google API Key or OAuth Access Token",
                "type": "password",
                "placeholder": "AIzaSy... or ya29...",
                "required": True,
                "description": "Google Cloud API Key or OAuth Bearer token with drive.readonly scope.",
            },
            {
                "name": "folder_id",
                "label": "Google Drive Folder or File ID",
                "type": "text",
                "placeholder": "1a2b3c4d5e6f...",
                "required": True,
                "description": "The Folder or File ID from your Google Drive URL.",
            },
        ]

    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        token_or_key = config.get("access_token_or_key", "").strip()
        folder_id = config.get("folder_id", "").strip()

        if not token_or_key or not folder_id:
            return False, "API Key/Token and Folder/File ID are required."

        headers = {}
        params = {}
        if token_or_key.startswith("ya29."):
            headers["Authorization"] = f"Bearer {token_or_key}"
        else:
            params["key"] = token_or_key

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                url = f"https://www.googleapis.com/drive/v3/files/{folder_id}?fields=id,name,mimeType"
                resp = await client.get(url, headers=headers, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    name = data.get("name") or "Google Drive Item"
                    return True, f"Successfully verified Google Drive access to '{name}'"
                else:
                    return False, f"Google Drive API error (HTTP {resp.status_code}): {resp.text[:200]}"
        except Exception as e:
            return False, f"Failed to connect to Google Drive: {str(e)}"

    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        token_or_key = config.get("access_token_or_key", "").strip()
        folder_id = config.get("folder_id", "").strip()

        headers = {}
        params = {}
        if token_or_key.startswith("ya29."):
            headers["Authorization"] = f"Bearer {token_or_key}"
        else:
            params["key"] = token_or_key

        items: List[IngestedItem] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # 1. Check if folder_id is a single file or a folder
                meta_url = f"https://www.googleapis.com/drive/v3/files/{folder_id}?fields=id,name,mimeType"
                meta_resp = await client.get(meta_url, headers=headers, params=params)
                if meta_resp.status_code != 200:
                    return []

                target_item = meta_resp.json()
                files_to_process = []

                if target_item.get("mimeType") == "application/vnd.google-apps.folder":
                    # Query children files in folder
                    list_url = f"https://www.googleapis.com/drive/v3/files?q='{folder_id}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&pageSize=25"
                    list_resp = await client.get(list_url, headers=headers, params=params)
                    if list_resp.status_code == 200:
                        files_to_process = list_resp.json().get("files", [])
                else:
                    files_to_process = [target_item]

                for file in files_to_process:
                    f_id = file.get("id")
                    f_name = file.get("name", "Document")
                    f_mime = file.get("mimeType", "")

                    content_text = ""
                    if f_mime == "application/vnd.google-apps.document":
                        # Export Google Doc as plain text
                        export_url = f"https://www.googleapis.com/drive/v3/files/{f_id}/export?mimeType=text/plain"
                        exp_resp = await client.get(export_url, headers=headers, params=params)
                        if exp_resp.status_code == 200:
                            content_text = exp_resp.text
                    elif f_mime == "application/pdf":
                        # Download PDF and extract text
                        dl_url = f"https://www.googleapis.com/drive/v3/files/{f_id}?alt=media"
                        dl_resp = await client.get(dl_url, headers=headers, params=params)
                        if dl_resp.status_code == 200:
                            pdf_file = io.BytesIO(dl_resp.content)
                            reader = PdfReader(pdf_file)
                            pages = [p.extract_text() for p in reader.pages[:30] if p.extract_text()]
                            content_text = "\n\n".join(pages)
                    elif "text" in f_mime:
                        dl_url = f"https://www.googleapis.com/drive/v3/files/{f_id}?alt=media"
                        dl_resp = await client.get(dl_url, headers=headers, params=params)
                        if dl_resp.status_code == 200:
                            content_text = dl_resp.text

                    if content_text.strip():
                        items.append(
                            IngestedItem(
                                title=f_name,
                                content=content_text.strip(),
                                source_type="google_drive",
                                source_url=f"https://drive.google.com/file/d/{f_id}/view",
                                metadata={"file_id": f_id, "mime_type": f_mime},
                            )
                        )
            except Exception as e:
                logger.error("Error fetching documents from Google Drive: %s", e)

        return items
