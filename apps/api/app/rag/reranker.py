"""
Proposal Assistant – Reranker & Guardrail Scorer
Filters candidates down to top passages and enforces MIN_SCORE threshold.
"""
from typing import List, Tuple

MIN_RELEVANCE_THRESHOLD = 0.60


def rerank_and_filter(
    candidates: List[dict],
    max_passages: int = 6,
    threshold: float = MIN_RELEVANCE_THRESHOLD,
) -> Tuple[List[dict], str, bool]:
    """
    Reranks passages, applies minimum threshold, and computes confidence.
    Returns: (filtered_passages, confidence_label, has_source)
    """
    if not candidates:
        return [], "LOW", False

    # Filter by threshold
    valid = [c for c in candidates if c.get("score", 0.0) >= threshold]
    if not valid:
        return [], "LOW", False

    # Take top N
    top_passages = valid[:max_passages]
    top_score = top_passages[0].get("score", 0.0)

    if top_score >= 0.82:
        confidence = "HIGH"
    elif top_score >= 0.70:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return top_passages, confidence, True
