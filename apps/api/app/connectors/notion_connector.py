"""
Proposal Assistant – Notion Connector
Connects to company Notion workspaces, extracts knowledge pages, product specs,
security FAQs, and policies, and ingests them into Mem0.
"""
import logging
from typing import Any, Dict, List, Tuple
import httpx

from app.connectors.base import BaseConnector, IngestedItem

logger = logging.getLogger(__name__)


class NotionConnector(BaseConnector):
    @property
    def id(self) -> str:
        return "notion"

    @property
    def name(self) -> str:
        return "Notion Workspace"

    @property
    def description(self) -> str:
        return "Ingests product documentation, security FAQs, engineering specs, and company wikis from Notion."

    @property
    def required_config_fields(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "api_key",
                "label": "Notion Integration Secret",
                "type": "password",
                "placeholder": "secret_abc123...",
                "required": True,
                "description": "Created at notion.so/my-integrations (must be shared with target pages).",
            },
            {
                "name": "page_or_db_id",
                "label": "Page or Database ID (Optional)",
                "type": "text",
                "placeholder": "Leave empty to index all shared pages",
                "required": False,
                "description": "Optional specific Notion page or database ID to limit scope.",
            },
        ]

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key.strip()}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }

    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        import os
        api_key = config.get("api_key", "").strip() or os.environ.get("NOTION_API_KEY", "").strip()
        if not api_key:
            return False, "Notion Integration Secret is required (provide in UI or set NOTION_API_KEY in .env)."

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.notion.com/v1/users/me", headers=self._get_headers(api_key))
                if resp.status_code == 200:
                    bot_name = resp.json().get("name") or "Notion Bot"
                    return True, f"Connected to Notion successfully as '{bot_name}'"
                else:
                    return False, f"Notion authorization failed (HTTP {resp.status_code}): {resp.text}"
        except Exception as e:
            return False, f"Connection failed to Notion API: {str(e)}"

    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        import os
        api_key = config.get("api_key", "").strip() or os.environ.get("NOTION_API_KEY", "").strip()
        headers = self._get_headers(api_key)
        items: List[IngestedItem] = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                # Search for accessible pages
                search_payload = {"filter": {"value": "page", "property": "object"}, "page_size": 25}
                resp = await client.post("https://api.notion.com/v1/search", headers=headers, json=search_payload)
                if resp.status_code != 200:
                    logger.warning("Notion search failed: %s", resp.text)
                    return []

                pages = resp.json().get("results", [])

                for page in pages:
                    page_id = page.get("id")
                    # Extract page title
                    title = "Untitled Notion Page"
                    props = page.get("properties", {})
                    for p_val in props.values():
                        if p_val.get("type") == "title" and p_val.get("title"):
                            title_parts = [t.get("plain_text", "") for t in p_val["title"]]
                            title = "".join(title_parts).strip() or title
                            break

                    # Fetch block children
                    blocks_resp = await client.get(
                        f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100",
                        headers=headers,
                    )
                    if blocks_resp.status_code != 200:
                        continue

                    blocks = blocks_resp.json().get("results", [])
                    content_lines = []

                    for b in blocks:
                        b_type = b.get("type")
                        b_data = b.get(b_type, {})
                        rich_texts = b_data.get("rich_text", [])
                        line = "".join([t.get("plain_text", "") for t in rich_texts]).strip()
                        if line:
                            content_lines.append(line)

                    full_content = "\n".join(content_lines)
                    if full_content.strip():
                        page_url = page.get("url")
                        items.append(
                            IngestedItem(
                                title=title,
                                content=full_content,
                                source_type="notion",
                                source_url=page_url,
                                metadata={"notion_page_id": page_id, "url": page_url},
                            )
                        )
            except Exception as e:
                logger.error("Error fetching documents from Notion: %s", e)

        return items
