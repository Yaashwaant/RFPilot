"""
Proposal Assistant – Atlassian Confluence Connector
Connects to Confluence Cloud/Server, pulls pages across engineering, security,
and compliance spaces, strips storage format HTML, and ingests into Mem0.
"""
import base64
import logging
from typing import Any, Dict, List, Tuple
import httpx
from bs4 import BeautifulSoup

from app.connectors.base import BaseConnector, IngestedItem

logger = logging.getLogger(__name__)


class ConfluenceConnector(BaseConnector):
    @property
    def id(self) -> str:
        return "confluence"

    @property
    def name(self) -> str:
        return "Atlassian Confluence"

    @property
    def description(self) -> str:
        return "Ingests spaces, technical architecture pages, security runbooks, and policies from Confluence Cloud."

    @property
    def required_config_fields(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "base_url",
                "label": "Confluence Base URL",
                "type": "text",
                "placeholder": "https://yourcompany.atlassian.net/wiki",
                "required": True,
                "description": "The base web URL of your Atlassian Confluence instance.",
            },
            {
                "name": "email",
                "label": "Atlassian Account Email",
                "type": "text",
                "placeholder": "you@company.com",
                "required": True,
                "description": "Your Confluence login email.",
            },
            {
                "name": "api_token",
                "label": "Atlassian API Token",
                "type": "password",
                "placeholder": "ATATT3xFfGF0...",
                "required": True,
                "description": "Generated at id.atlassian.com/manage-profile/security/api-tokens",
            },
            {
                "name": "space_key",
                "label": "Space Key (Optional)",
                "type": "text",
                "placeholder": "e.g. SEC, ENG, POLICIES",
                "required": False,
                "description": "Optional space key to scope document retrieval.",
            },
        ]

    def _get_headers(self, email: str, api_token: str) -> Dict[str, str]:
        auth_str = f"{email.strip()}:{api_token.strip()}"
        b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
        return {
            "Authorization": f"Basic {b64_auth}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        base_url = config.get("base_url", "").strip().rstrip("/")
        email = config.get("email", "").strip()
        api_token = config.get("api_token", "").strip()

        if not base_url or not email or not api_token:
            return False, "Base URL, Email, and API Token are all required."

        api_endpoint = f"{base_url}/rest/api/user/current"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(api_endpoint, headers=self._get_headers(email, api_token))
                if resp.status_code == 200:
                    display_name = resp.json().get("displayName") or email
                    return True, f"Successfully authenticated to Confluence as '{display_name}'"
                else:
                    return False, f"Confluence authentication failed (HTTP {resp.status_code}): {resp.text[:200]}"
        except Exception as e:
            return False, f"Failed to connect to Confluence at {base_url}: {str(e)}"

    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        base_url = config.get("base_url", "").strip().rstrip("/")
        email = config.get("email", "").strip()
        api_token = config.get("api_token", "").strip()
        space_key = config.get("space_key", "").strip()

        headers = self._get_headers(email, api_token)
        items: List[IngestedItem] = []

        endpoint = f"{base_url}/rest/api/content?type=page&expand=body.storage,version&limit=30"
        if space_key:
            endpoint += f"&spaceKey={space_key}"

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.get(endpoint, headers=headers)
                if resp.status_code != 200:
                    logger.warning("Confluence content fetch failed (HTTP %s): %s", resp.status_code, resp.text[:200])
                    return []

                data = resp.json()
                pages = data.get("results", [])

                for page in pages:
                    title = page.get("title", "Confluence Page")
                    body_storage = page.get("body", {}).get("storage", {}).get("value", "")

                    if body_storage:
                        soup = BeautifulSoup(body_storage, "html.parser")
                        clean_text = soup.get_text(separator="\n", strip=True)
                        lines = [line.strip() for line in clean_text.splitlines() if len(line.strip()) > 3]
                        content = "\n".join(lines)

                        if len(content) > 40:
                            page_link = f"{base_url}{page.get('_links', {}).get('webui', '')}"
                            items.append(
                                IngestedItem(
                                    title=title,
                                    content=content,
                                    source_type="confluence",
                                    source_url=page_link,
                                    metadata={"space": space_key, "page_id": page.get("id"), "url": page_link},
                                )
                            )
        except Exception as e:
            logger.error("Error fetching documents from Confluence: %s", e)

        return items
