"""
Proposal Assistant – Microsoft SharePoint & OneDrive Connector
Connects to corporate SharePoint document libraries and OneDrive folders
via Microsoft Graph API to ingest Word documents, Excel workbooks, and PDFs into Mem0.
"""
import io
import logging
from typing import Any, Dict, List, Tuple
import httpx
from pypdf import PdfReader

from app.connectors.base import BaseConnector, IngestedItem

logger = logging.getLogger(__name__)


class SharePointConnector(BaseConnector):
    @property
    def id(self) -> str:
        return "sharepoint"

    @property
    def name(self) -> str:
        return "Microsoft SharePoint & OneDrive"

    @property
    def description(self) -> str:
        return "Ingests proposal decks, security whitepapers, and RFPs from corporate SharePoint document libraries."

    @property
    def required_config_fields(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "tenant_id",
                "label": "Azure AD Tenant ID",
                "type": "text",
                "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "required": True,
                "description": "Directory (tenant) ID from Azure Portal / Entra ID.",
            },
            {
                "name": "client_id",
                "label": "App (Client) ID",
                "type": "text",
                "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "required": True,
                "description": "App registration client ID with Files.Read.All permission.",
            },
            {
                "name": "client_secret",
                "label": "Client Secret",
                "type": "password",
                "placeholder": "Secret value from App Registration",
                "required": True,
                "description": "Client secret generated in Azure App Registrations.",
            },
            {
                "name": "site_id",
                "label": "SharePoint Site ID or Drive ID",
                "type": "text",
                "placeholder": "company.sharepoint.com,site-id,web-id",
                "required": True,
                "description": "Target SharePoint Site ID or Drive ID containing proposal collateral.",
            },
        ]

    async def _get_access_token(self, tenant_id: str, client_id: str, client_secret: str) -> Optional[str]:
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(token_url, data=payload)
            if resp.status_code == 200:
                return resp.json().get("access_token")
            return None

    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        tenant_id = config.get("tenant_id", "").strip()
        client_id = config.get("client_id", "").strip()
        client_secret = config.get("client_secret", "").strip()
        site_id = config.get("site_id", "").strip()

        if not all([tenant_id, client_id, client_secret, site_id]):
            return False, "Tenant ID, Client ID, Client Secret, and Site ID are required."

        try:
            token = await self._get_access_token(tenant_id, client_id, client_secret)
            if not token:
                return False, "Failed to authenticate with Microsoft Entra ID. Check your Client ID and Secret."

            # Query Graph API for site
            headers = {"Authorization": f"Bearer {token}"}
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"https://graph.microsoft.com/v1.0/sites/{site_id}", headers=headers)
                if resp.status_code == 200:
                    display_name = resp.json().get("displayName") or "SharePoint Site"
                    return True, f"Connected successfully to SharePoint site '{display_name}'"
                return False, f"Failed to access SharePoint site (HTTP {resp.status_code}): {resp.text[:200]}"
        except Exception as e:
            return False, f"SharePoint connection error: {str(e)}"

    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        tenant_id = config.get("tenant_id", "").strip()
        client_id = config.get("client_id", "").strip()
        client_secret = config.get("client_secret", "").strip()
        site_id = config.get("site_id", "").strip()

        token = await self._get_access_token(tenant_id, client_id, client_secret)
        if not token:
            return []

        headers = {"Authorization": f"Bearer {token}"}
        items: List[IngestedItem] = []

        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                # Query drive items in default drive
                drive_url = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root/children"
                resp = await client.get(drive_url, headers=headers)
                if resp.status_code != 200:
                    return []

                files = resp.json().get("value", [])
                for file in files[:20]:
                    name = file.get("name", "Document")
                    web_url = file.get("webUrl", "")
                    dl_url = file.get("@microsoft.graph.downloadUrl")

                    if dl_url and (name.lower().endswith(".pdf") or name.lower().endswith(".txt")):
                        dl_resp = await client.get(dl_url)
                        if dl_resp.status_code == 200:
                            content_text = ""
                            if name.lower().endswith(".pdf"):
                                pdf = PdfReader(io.BytesIO(dl_resp.content))
                                pages = [p.extract_text() for p in pdf.pages[:30] if p.extract_text()]
                                content_text = "\n\n".join(pages)
                            else:
                                content_text = dl_resp.text

                            if content_text.strip():
                                items.append(
                                    IngestedItem(
                                        title=name,
                                        content=content_text.strip(),
                                        source_type="sharepoint",
                                        source_url=web_url,
                                        metadata={"site_id": site_id, "name": name},
                                    )
                                )
        except Exception as e:
            logger.error("Error fetching documents from SharePoint: %s", e)

        return items
