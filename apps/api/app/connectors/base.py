"""
Proposal Assistant – Base Connector Interface
Defines the contract for external enterprise knowledge and RFP document connectors.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class IngestedItem:
    """Represents a document chunk, article, or Q&A pair fetched by a connector."""
    title: str
    content: str
    source_type: str
    source_url: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseConnector(ABC):
    """Abstract base class for all enterprise document & past RFP connectors."""

    @property
    @abstractmethod
    def id(self) -> str:
        """Unique slug identifier for the connector (e.g., 'notion', 'google_drive')."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Display name of the connector."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """User-friendly summary of the connector capabilities."""
        pass

    @property
    @abstractmethod
    def required_config_fields(self) -> List[Dict[str, Any]]:
        """List of configuration field definitions required to connect."""
        pass

    @abstractmethod
    async def test_connection(self, config: Dict[str, Any]) -> Tuple[bool, str]:
        """Tests the supplied credentials or connectivity."""
        pass

    @abstractmethod
    async def fetch_documents(self, config: Dict[str, Any]) -> List[IngestedItem]:
        """Fetches documents, pages, or Q&A pairs from the remote source."""
        pass
