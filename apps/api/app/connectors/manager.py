"""
Proposal Assistant – Connector Manager
Registry and ingestion coordinator for enterprise document and past RFP connectors.
Feeds fetched documents and Q&A items into the Mem0 persistent memory layer.
"""
import logging
from typing import Any, Dict, List, Optional, Tuple

from app.connectors.base import BaseConnector, IngestedItem
from app.connectors.confluence_connector import ConfluenceConnector
from app.connectors.google_drive_connector import GoogleDriveConnector
from app.connectors.notion_connector import NotionConnector
from app.connectors.past_rfp_connector import PastRfpWorkbookConnector
from app.connectors.sharepoint_connector import SharePointConnector
from app.connectors.web_connector import WebDocumentationConnector
from app.services.memory_service import get_memory_service

logger = logging.getLogger(__name__)


class ConnectorManager:
    def __init__(self):
        self._connectors: Dict[str, BaseConnector] = {}
        self._register_default_connectors()

    def _register_default_connectors(self):
        connectors: List[BaseConnector] = [
            WebDocumentationConnector(),
            NotionConnector(),
            ConfluenceConnector(),
            GoogleDriveConnector(),
            SharePointConnector(),
            PastRfpWorkbookConnector(),
        ]
        for conn in connectors:
            self._connectors[conn.id] = conn

    def list_connectors(self) -> List[Dict[str, Any]]:
        """Returns details and configuration requirements for all available connectors."""
        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "fields": c.required_config_fields,
            }
            for c in self._connectors.values()
        ]

    def get_connector(self, connector_id: str) -> Optional[BaseConnector]:
        return self._connectors.get(connector_id)

    async def test_connector(self, connector_id: str, config: Dict[str, Any]) -> Tuple[bool, str]:
        connector = self.get_connector(connector_id)
        if not connector:
            return False, f"Unknown connector ID '{connector_id}'"
        return await connector.test_connection(config)

    async def sync_connector_to_mem0(
        self,
        connector_id: str,
        config: Dict[str, Any],
        user_id: str,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes document retrieval from the external connector and commits each
        document or Q&A pair into Mem0 persistent memory.
        """
        connector = self.get_connector(connector_id)
        if not connector:
            raise ValueError(f"Unknown connector ID: {connector_id}")

        items: List[IngestedItem] = await connector.fetch_documents(config)
        if not items:
            return {
                "status": "COMPLETED",
                "connector_id": connector_id,
                "items_found": 0,
                "memories_created": 0,
                "message": "No documents or content found with the provided configuration.",
            }

        ms = get_memory_service()
        memories_count = 0

        for item in items:
            meta = {
                "title": item.title,
                "source_type": item.source_type,
                "source_url": item.source_url,
                **(item.metadata or {}),
            }
            if project_id:
                meta["project_id"] = project_id

            # For long documents, break into coherent passages of ~800 chars
            content = item.content.strip()
            chunk_size = 800
            overlap = 100

            if len(content) <= chunk_size:
                text_to_save = f"Title: {item.title}\n{content}"
                res = await ms.add_memory(
                    messages_or_text=text_to_save,
                    user_id=user_id,
                    project_id=project_id,
                    metadata=meta,
                )
                if res:
                    memories_count += 1
            else:
                start = 0
                while start < len(content):
                    end = min(start + chunk_size, len(content))
                    passage = content[start:end].strip()
                    if len(passage) > 30:
                        text_to_save = f"Document: {item.title}\n{passage}"
                        res = await ms.add_memory(
                            messages_or_text=text_to_save,
                            user_id=user_id,
                            project_id=project_id,
                            metadata=meta,
                        )
                        if res:
                            memories_count += 1
                    start += chunk_size - overlap
                    if memories_count >= 15:  # Safeguard rate limit per sync
                        break

        return {
            "status": "SUCCESS",
            "connector_id": connector_id,
            "items_found": len(items),
            "memories_created": memories_count,
            "message": f"Successfully ingested {len(items)} items ({memories_count} memory facts) into Mem0.",
        }

    async def ingest_past_rfp_excel(
        self,
        file_bytes: bytes,
        filename: str,
        user_id: str,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extracts all answered Q&A pairs from an uploaded past RFP workbook and feeds them to Mem0."""
        items = PastRfpWorkbookConnector.extract_from_excel_bytes(file_bytes, filename)
        if not items:
            return {
                "status": "NO_QA_FOUND",
                "items_found": 0,
                "memories_created": 0,
                "message": "No structured Question and Answer columns could be detected in the workbook.",
            }

        ms = get_memory_service()
        memories_count = 0

        for item in items:
            res = await ms.add_memory(
                messages_or_text=item.content,
                user_id=user_id,
                project_id=project_id,
                metadata={
                    "title": item.title,
                    "source_type": "past_rfp_excel",
                    **(item.metadata or {}),
                },
            )
            if res:
                memories_count += 1
            if memories_count >= 50:  # Safeguard max Q&A per upload
                break

        return {
            "status": "SUCCESS",
            "items_found": len(items),
            "memories_created": memories_count,
            "message": f"Successfully extracted and memorized {memories_count} approved RFP answers from '{filename}' into Mem0.",
        }


_connector_manager_instance: Optional[ConnectorManager] = None


def get_connector_manager() -> ConnectorManager:
    global _connector_manager_instance
    if _connector_manager_instance is None:
        _connector_manager_instance = ConnectorManager()
    return _connector_manager_instance
