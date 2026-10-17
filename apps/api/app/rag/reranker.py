"""
Proposal Assistant – Reranker & Guardrail Scorer
Uses TypeSafe Jev AI decision model via OpenRouter
to evaluate passage relevance, filter candidates, and enforce guardrails.
"""
import asyncio
import json
import logging
from typing import List, Tuple
import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

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
    Invokes TypeSafe Jev AI decision model via OpenRouter.
    Evaluates whether the candidate collateral passage factually supports the question.
    Returns: probability score between 0.0 and 1.0.
    """
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "RFPilot",
        "Content-Type": "application/json",
    }

    # First attempt: OpenRouter alpha decisions endpoint
    state_text = (
        f"RFP Requirement Question:\n{question}\n\n"
        f"Candidate Collateral Passage:\n"
        f"Document: {candidate.get('doc', 'Knowledge Base')}\n"
        f"Section: {candidate.get('section', 'General')}\n"
        f"Content:\n{candidate.get('snippet', candidate.get('content', ''))}"
    )

    payload_decisions = {
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

    url_decisions = f"{base_url.rstrip('/')}/alpha/decisions"

    try:
        response = await client.post(url_decisions, json=payload_decisions, headers=headers, timeout=5.0)
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
    except Exception:
        pass

    # Second attempt: Chat completions structured evaluation (works with typesafe/jev-router)
    prompt = (
        "You are an expert RFP compliance evaluator. Evaluate whether the collateral passage below factually supports and provides evidence for the requirement question.\n\n"
        f"RFP Requirement Question: {question}\n\n"
        f"Collateral Document: {candidate.get('doc')} | Section: {candidate.get('section')}\n"
        f"Content: {candidate.get('snippet')}\n\n"
        'Return strictly valid JSON with keys: "is_relevant" (boolean) and "confidence" (float between 0.0 and 1.0).'
    )
    chat_payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_tokens": 50,
        "temperature": 0.0,
    }
    chat_url = f"{base_url.rstrip('/')}/v1/chat/completions"

    try:
        r = await client.post(chat_url, json=chat_payload, headers=headers, timeout=5.0)
        if r.status_code == 200:
            choice = r.json().get("choices", [{}])[0]
            msg = choice.get("message", {})
            content = msg.get("content") or msg.get("reasoning") or ""
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1:
                parsed = json.loads(content[start : end + 1])
                conf = float(parsed.get("confidence", 0.5))
                is_rel = bool(parsed.get("is_relevant", True))
                return conf if is_rel else conf * 0.2
            elif "true" in content.lower():
                return 0.90
    except Exception as e:
        logger.warning("Error evaluating with Jev AI: %s", e)

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

    current_settings = Settings()
    api_key = current_settings.OPENROUTER_API_KEY.strip() if current_settings.OPENROUTER_API_KEY else ""
    model = current_settings.OPENROUTER_JEV_MODEL or "typesafe/jev-router"
    base_url = current_settings.OPENROUTER_BASE_URL or "https://openrouter.ai/api"

    # If OpenRouter API Key is available and a question is provided, evaluate with Jev AI
    if api_key and question.strip():
        eval_pool = candidates[:8]
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
