"""
Proposal Assistant – Web & Documentation Portal Connector
Crawls and ingests public documentation, trust centers (e.g. trust.company.com),
security portals, whitepaper PDFs, and compliance URLs into Mem0.
"""
import io
import logging
from typing import Any, Dict, List, Tuple
import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.connectors.base import BaseConnector, IngestedItem

logger = logging.getLogger(__name__)


class WebDocumentationConnector(BaseConnector):
    @property
    def id(self) -> str:
        return "web_documentation"

    @property
    def name(self) -> str:
        return "Web & Documentation Portal"

    @property
    def description(self) -> str:
        return "Ingests company trust centers, security pages, API docs, and public whitepaper PDFs directly into Mem0."

    @property
    def required_config_fields(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "urls",
                "label": "URLs to Ingest",
                "type": "textarea",
                "placeholder": "https://trust.company.com/security\nhttps://company.com/privacy\nhttps://company.com/compliance.pdf",
                "required": True,
                "description": "Enter one URL per line (supports web pages and PDFs).",
            }
        ]

    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        raw_urls = config.get("urls", "").strip()
        if not raw_urls:
            return False, "Please provide at least one valid URL."

        first_url = [u.strip() for u in raw_urls.splitlines() if u.strip()][0]
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.head(first_url)
                if resp.status_code < 400:
                    return True, f"Successfully reached {first_url} (HTTP {resp.status_code})"
                # Fallback to GET if HEAD method is forbidden
                resp = await client.get(first_url)
                if resp.status_code < 400:
                    return True, f"Successfully reached {first_url} (HTTP {resp.status_code})"
                return False, f"Server returned HTTP {resp.status_code} for {first_url}"
        except Exception as e:
            return False, f"Connection failed to {first_url}: {str(e)}"

    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        raw_urls = config.get("urls", "").strip()
        urls = [u.strip() for u in raw_urls.splitlines() if u.strip().startswith("http")]

        items: List[IngestedItem] = []
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 RFPilot/1.0"
        }

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers=headers) as client:
            for url in urls:
                try:
                    resp = await client.get(url)
                    if resp.status_code >= 400:
                        logger.warning("Failed to fetch %s (HTTP %s)", url, resp.status_code)
                        continue

                    content_type = resp.headers.get("content-type", "").lower()

                    if "pdf" in content_type or url.lower().endswith(".pdf"):
                        # Extract PDF content
                        pdf_file = io.BytesIO(resp.content)
                        reader = PdfReader(pdf_file)
                        text_parts = []
                        for idx, page in enumerate(reader.pages[:30]):  # Max 30 pages
                            page_text = page.extract_text() or ""
                            if page_text.strip():
                                text_parts.append(page_text.strip())

                        full_text = "\n\n".join(text_parts)
                        doc_title = url.split("/")[-1] or "Whitepaper PDF"
                        if full_text.strip():
                            items.append(
                                IngestedItem(
                                    title=doc_title,
                                    content=full_text,
                                    source_type="web_pdf",
                                    source_url=url,
                                    metadata={"url": url, "pages": len(reader.pages)},
                                )
                            )
                    else:
                        # Extract Web HTML
                        soup = BeautifulSoup(resp.text, "html.parser")
                        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
                            element.decompose()

                        title = soup.title.string.strip() if soup.title and soup.title.string else url
                        text = soup.get_text(separator="\n", strip=True)

                        # Clean up repetitive newlines
                        cleaned_lines = [line.strip() for line in text.splitlines() if len(line.strip()) > 3]
                        cleaned_content = "\n".join(cleaned_lines)

                        if len(cleaned_content) > 50:
                            items.append(
                                IngestedItem(
                                    title=title,
                                    content=cleaned_content,
                                    source_type="web_portal",
                                    source_url=url,
                                    metadata={"url": url, "title": title},
                                )
                            )
                except Exception as e:
                    logger.warning("Error ingesting web URL %s: %s", url, e)

        return items
