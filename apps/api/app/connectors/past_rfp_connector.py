"""
Proposal Assistant – Past Completed RFP Workbook Connector
Parses historical completed RFP spreadsheets (.xlsx, .csv), detects requirement/question
columns and approved response/compliance columns, and ingests every verified Q&A pair into Mem0.
"""
import io
import logging
from typing import Any, Dict, List, Tuple
import openpyxl

from app.connectors.base import BaseConnector, IngestedItem

logger = logging.getLogger(__name__)


class PastRfpWorkbookConnector(BaseConnector):
    @property
    def id(self) -> str:
        return "past_rfp_workbook"

    @property
    def name(self) -> str:
        return "Past Completed RFP Importer"

    @property
    def description(self) -> str:
        return "Extracts approved question-and-answer pairs from past submitted RFP spreadsheets (.xlsx) and ingests them into Mem0."

    @property
    def required_config_fields(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "rfp_name",
                "label": "Past Proposal / RFP Name",
                "type": "text",
                "placeholder": "e.g. 2025 Global Bank Security RFP",
                "required": True,
                "description": "Identifier for the past proposal or client.",
            },
            {
                "name": "qa_pairs_text",
                "label": "Paste Past RFP Q&A or Requirements",
                "type": "textarea",
                "placeholder": "Q: What is your data retention policy?\nA: Customer operational data is retained for 90 days following transaction completion.\n\nQ: Do you support SSO?\nA: Yes, via SAML 2.0 and OIDC.",
                "required": True,
                "description": "Paste past answered questions or requirements in Q/A or Tabular format.",
            },
        ]

    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        text = config.get("qa_pairs_text", "").strip()
        rfp_name = config.get("rfp_name", "").strip()
        if not rfp_name:
            return False, "Past Proposal / RFP Name is required."
        if not text:
            return False, "Please paste at least one Q&A pair or requirement text."
        return True, f"Validated past RFP '{rfp_name}' for extraction."

    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        rfp_name = config.get("rfp_name", "Historical Proposal")
        text = config.get("qa_pairs_text", "").strip()
        if not text:
            return []

        items: List[IngestedItem] = []

        # Parse blocks separated by double newlines or Q:/A: markers
        blocks = [b.strip() for b in text.split("\n\n") if b.strip()]

        for idx, block in enumerate(blocks):
            if len(block) < 15:
                continue
            title = f"{rfp_name} - Requirement #{idx + 1}"
            first_line = block.splitlines()[0]
            if len(first_line) < 80:
                title = f"{rfp_name}: {first_line.lstrip('Q:').strip()}"

            items.append(
                IngestedItem(
                    title=title,
                    content=block,
                    source_type="past_rfp",
                    metadata={
                        "rfp_name": rfp_name,
                        "type": "past_approved_rfp",
                        "index": idx + 1,
                    },
                )
            )

        return items

    @classmethod
    def extract_from_excel_bytes(cls, file_bytes: bytes, filename: str) -> List[IngestedItem]:
        """Utility to parse uploaded .xlsx past RFPs and extract Q&A rows."""
        items: List[IngestedItem] = []
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            for sheetname in wb.sheetnames:
                ws = wb[sheetname]
                header_row_idx = None
                question_col = None
                answer_col = None

                # Detect header row
                for r_idx, row in enumerate(ws.iter_rows(max_row=15, values_only=True), start=1):
                    row_strs = [str(c).lower() if c else "" for c in row]
                    q_indices = [i for i, c in enumerate(row_strs) if any(k in c for k in ["requirement", "question", "description", "specification"])]
                    a_indices = [i for i, c in enumerate(row_strs) if any(k in c for k in ["response", "answer", "vendor comment", "compliance note"])]
                    if q_indices and a_indices:
                        header_row_idx = r_idx
                        question_col = q_indices[0]
                        answer_col = a_indices[0]
                        break

                if header_row_idx and question_col is not None and answer_col is not None:
                    # Extract rows below header
                    for r_idx, row in enumerate(ws.iter_rows(min_row=header_row_idx + 1, values_only=True), start=header_row_idx + 1):
                        if len(row) <= max(question_col, answer_col):
                            continue
                        q_val = str(row[question_col] or "").strip()
                        a_val = str(row[answer_col] or "").strip()

                        if len(q_val) > 8 and len(a_val) > 3:
                            content = f"Requirement: {q_val}\nApproved Vendor Response: {a_val}"
                            items.append(
                                IngestedItem(
                                    title=f"{filename} [{sheetname}:R{r_idx}]",
                                    content=content,
                                    source_type="past_rfp_excel",
                                    metadata={
                                        "source_file": filename,
                                        "sheet": sheetname,
                                        "row": r_idx,
                                        "type": "approved_rfp_answer",
                                    },
                                )
                            )
        except Exception as e:
            logger.error("Error extracting from Excel workbook %s: %s", filename, e)

        return items
