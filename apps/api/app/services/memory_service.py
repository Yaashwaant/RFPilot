"""
Proposal Assistant – Mem0 Memory Service
Integrates Mem0 (https://github.com/mem0ai/mem0) as the persistent institutional
memory layer for continuous learning across proposals, RFPs, and reviewer approvals.
Supports both Mem0 Cloud (MemoryClient) and Open-Source Local Mem0 (Memory with Qdrant).
"""
import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class MemoryService:
    """
    Unified memory layer interface wrapping Mem0.
    Stores and retrieves memories across users, proposals (run_id), and organizations.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self._client: Any = None
        self._is_cloud: bool = False
        self._init_error: Optional[str] = None
        self._initialize()

    def _initialize(self):
        """Initializes either Mem0 Cloud MemoryClient or OSS Local Memory."""
        if not self.settings.MEM0_ENABLED:
            logger.info("Mem0 memory service is disabled via MEM0_ENABLED=False.")
            return

        api_key = (self.settings.MEM0_API_KEY or "").strip()
        openrouter_key = (self.settings.OPENROUTER_API_KEY or "").strip()

        # Mode A: Mem0 Cloud / Platform
        if api_key:
            try:
                from mem0 import MemoryClient

                self._client = MemoryClient(api_key=api_key)
                self._is_cloud = True
                logger.info("Mem0 MemoryClient initialized successfully (Cloud Platform mode).")
                return
            except Exception as e:
                logger.warning("Failed to initialize Mem0 MemoryClient with MEM0_API_KEY: %s", e)
                self._init_error = str(e)

        # Mode B: Open-Source Local Mem0 with OpenRouter LLM + Embeddings + Embedded Qdrant
        try:
            from mem0 import Memory

            base_dir = Path(__file__).resolve().parent.parent.parent
            storage_path = str(base_dir / self.settings.MEM0_STORAGE_PATH)
            os.makedirs(storage_path, exist_ok=True)

            openrouter_base = self.settings.OPENROUTER_BASE_URL.rstrip("/")
            if not openrouter_base.endswith("/v1"):
                openrouter_base = f"{openrouter_base}/v1"

            llm_model = self.settings.OPENROUTER_LLM_MODEL or "deepseek/deepseek-v4.1-flash-1017"

            config = {
                "llm": {
                    "provider": "openai",
                    "config": {
                        "model": llm_model,
                        "temperature": 0.1,
                        "max_tokens": 1200,
                        "openai_base_url": openrouter_base,
                        "api_key": openrouter_key or "sk-or-placeholder",
                    },
                },
                "embedder": {
                    "provider": "openai",
                    "config": {
                        "model": "text-embedding-3-small",
                        "embedding_dims": 1536,
                        "openai_base_url": openrouter_base,
                        "api_key": openrouter_key or "sk-or-placeholder",
                    },
                },
                "vector_store": {
                    "provider": "qdrant",
                    "config": {
                        "path": storage_path,
                        "collection_name": self.settings.MEM0_COLLECTION_NAME,
                        "embedding_model_dims": 1536,
                        "on_disk": True,
                    },
                },
                "version": "v1.1",
            }

            self._client = Memory.from_config(config)
            self._is_cloud = False
            logger.info("Mem0 Local Memory initialized successfully with embedded Qdrant at %s", storage_path)
        except Exception as e:
            logger.warning("Failed to initialize local Mem0 Memory: %s", e)
            self._init_error = str(e)

    @property
    def is_available(self) -> bool:
        """Returns True if Mem0 client is successfully instantiated."""
        return self._client is not None

    async def add_memory(
        self,
        messages_or_text: Union[str, List[Dict[str, str]]],
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Stores user statements, approved RFP answers, or key organizational facts.
        """
        if not self._client:
            return None

        meta = dict(metadata or {})
        if project_id:
            meta["project_id"] = project_id

        kwargs: Dict[str, Any] = {}
        if user_id:
            kwargs["user_id"] = user_id
        if project_id:
            kwargs["run_id"] = project_id
        if meta:
            kwargs["metadata"] = meta

        try:
            res = await asyncio.to_thread(self._client.add, messages_or_text, **kwargs)
            logger.info("Mem0 memory added successfully: %s", res)
            return res
        except Exception as e:
            logger.warning("Error adding memory to Mem0: %s", e)
            return None

    async def search_memory(
        self,
        query: str,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Performs semantic search across institutional memories for RFP grounding.
        """
        if not self._client or not query.strip():
            return []

        filters: Dict[str, Any] = {}
        if user_id:
            filters["user_id"] = user_id
        if project_id:
            filters["run_id"] = project_id

        try:
            kwargs: Dict[str, Any] = {"limit": limit}
            if filters:
                kwargs["filters"] = filters

            raw = await asyncio.to_thread(self._client.search, query, **kwargs)

            # Standardize results from MemoryClient vs OSS Memory
            items = []
            if isinstance(raw, dict):
                candidates = raw.get("results", [])
            elif isinstance(raw, list):
                candidates = raw
            else:
                candidates = []

            for item in candidates:
                if not isinstance(item, dict):
                    continue
                mem_text = item.get("memory") or item.get("text") or item.get("content") or ""
                if not mem_text:
                    continue
                items.append({
                    "id": str(item.get("id", "")),
                    "memory": mem_text,
                    "score": float(item.get("score", 0.85)),
                    "created_at": item.get("created_at") or item.get("updated_at"),
                    "metadata": item.get("metadata") or {},
                })

            return items
        except Exception as e:
            logger.warning("Error searching Mem0 memory: %s", e)
            return []

    async def get_all_memories(
        self,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Retrieves all memories matching the given filter.
        """
        if not self._client:
            return []

        filters: Dict[str, Any] = {}
        if user_id:
            filters["user_id"] = user_id
        if project_id:
            filters["run_id"] = project_id

        try:
            kwargs: Dict[str, Any] = {"limit": limit}
            if filters:
                kwargs["filters"] = filters

            raw = await asyncio.to_thread(self._client.get_all, **kwargs)

            items = []
            if isinstance(raw, dict):
                candidates = raw.get("results", [])
            elif isinstance(raw, list):
                candidates = raw
            else:
                candidates = []

            for item in candidates:
                if not isinstance(item, dict):
                    continue
                mem_text = item.get("memory") or item.get("text") or item.get("content") or ""
                items.append({
                    "id": str(item.get("id", "")),
                    "memory": mem_text,
                    "created_at": item.get("created_at") or item.get("updated_at"),
                    "metadata": item.get("metadata") or {},
                })
            return items
        except Exception as e:
            logger.warning("Error getting all memories from Mem0: %s", e)
            return []

    async def delete_memory(self, memory_id: str) -> bool:
        """Deletes a memory item by ID."""
        if not self._client or not memory_id:
            return False
        try:
            await asyncio.to_thread(self._client.delete, memory_id=memory_id)
            return True
        except Exception as e:
            logger.warning("Error deleting memory %s from Mem0: %s", memory_id, e)
            return False


_memory_service_instance: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    """Singleton getter for MemoryService."""
    global _memory_service_instance
    if _memory_service_instance is None:
        _memory_service_instance = MemoryService()
    return _memory_service_instance
