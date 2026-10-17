"""
Proposal Assistant – Reranker & Guardrail Scorer
Uses TypeSafe Jev AI decision model via OpenRouter Decisions API
to evaluate passage relevance, filter candidates, and enforce guardrails.
"""
import asyncio
import logging
from typing import List, Tuple
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MIN_RELEVANCE_THRESHOLD = 0.60


async def _score_single_candidate_jev(
    client: httpx.AsyncClient,
    candidate: dict,
    question: str,
    api_key: str,
    model: str,
    base_url: str,
) -> float:
    """
    Invokes TypeSafe Jev AI decision model via OpenRouter Decisions API.
    Evaluates whether the candidate collateral passage factually supports the question.
    Returns: probability score between 0.0 and 1.0.
    """
    state_text = (
        f"RFP Requirement Question:\n{question}\n\n"
        f"Candidate Collateral Passage:\n"
        f"Document: {candidate.get('doc', 'Knowledge Base')}\n"
        f"Section: {candidate.get('section', 'General')}\n"
        f"Content:\n{candidate.get('snippet', candidate.get('content', ''))}"
    )

    payload = {
        "model": model,
        "state": state_text,
        "questions": {
            "is_relevant": {
                "type": "noul",
                "instructions": (
                    "Does this collateral passage provide verified, factual evidence "
                    "or operational compliance context directly relevant to answering the RFP question?"
                ),
            }
        },
    }

    url = f"{base_url.rstrip('/')}/alpha/decisions"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "HTTP-Referer": settings.OPENROUTER_SITE_URL,
        "X-Title": settings.OPENROUTER_APP_NAME,
        "Content-Type": "application/json",
    }

    try:
        response = await client.post(url, json=payload, headers=headers, timeout=6.0)
        if response.status_code == 200:
            data = response.json()
            answers = data.get("answers", {})
            q_res = answers.get("is_relevant")
            if isinstance(q_res, dict):
                score = q_res.get("noul")
                if score is not None:
                    return float(score)
            elif isinstance(q_res, (int, float)):
                return float(q_res)
            logger.warning("Unexpected Jev response format: %s", data)
        else:
            logger.warning(
                "OpenRouter Jev API returned status %d: %s",
                response.status_code,
                response.text[:200],
            )
    except Exception as e:
        logger.warning("Error invoking OpenRouter Jev decision model: %s", e)

    # Fallback to candidate's existing retrieval score
    return float(candidate.get("score", 0.0))


async def rerank_and_filter(
    candidates: List[dict],
    question: str = "",
    max_passages: int = 6,
    threshold: float = MIN_RELEVANCE_THRESHOLD,
) -> Tuple[List[dict], str, bool]:
    """
    Reranks candidates using OpenRouter TypeSafe Jev AI decision model (when configured)
    or existing lexical/vector scores, applies minimum threshold, and computes confidence.

    Returns: (filtered_passages, confidence_label, has_source)
    """
    if not candidates:
        return [], "LOW", False

    api_key = settings.OPENROUTER_API_KEY.strip() if settings.OPENROUTER_API_KEY else ""
    model = settings.OPENROUTER_JEV_MODEL or "typesafe/jev-latest"
    base_url = settings.OPENROUTER_BASE_URL or "https://openrouter.ai/api"

    # If OpenRouter API Key is available and a question is provided, evaluate with Jev AI
    if api_key and question.strip():
        # Evaluate up to top 12 candidates concurrently
        eval_pool = candidates[:12]
        async with httpx.AsyncClient() as client:
            tasks = [
                _score_single_candidate_jev(
                    client=client,
                    candidate=c,
                    question=question,
                    api_key=api_key,
                    model=model,
                    base_url=base_url,
                )
                for c in eval_pool
            ]
            scores = await asyncio.gather(*tasks, return_exceptions=True)

        for i, res in enumerate(scores):
            if isinstance(res, (int, float)):
                eval_pool[i]["score"] = round(float(res), 4)
                eval_pool[i]["rerank_model"] = model

        # Sort descending by updated Jev decision score
        candidates = sorted(eval_pool, key=lambda x: x.get("score", 0.0), reverse=True)
    else:
        # Sort candidates by initial retrieval score
        candidates = sorted(candidates, key=lambda x: x.get("score", 0.0), reverse=True)

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
