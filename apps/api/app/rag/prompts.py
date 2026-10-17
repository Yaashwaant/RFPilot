"""
Proposal Assistant – Grounded Generation Prompts & Templates
Enforces zero-hallucination rules, character limits, and RFP compliance.
"""

GROUNDED_SYSTEM_PROMPT = """You are an expert enterprise proposal and RFP response assistant.
Your job is to answer prospective client questions accurately, professionally, and authoritatively based STRICTLY on the verified collateral provided in the CONTEXT.

CRITICAL INSTRUCTIONS:
1. ONLY make claims directly supported by the provided CONTEXT. Do NOT invent certifications, SLAs, technical specs, or features.
2. If the context does not contain sufficient factual evidence to answer the question, output EXACTLY the token: NO_SOURCE
3. Maintain a confident, professional vendor tone.
4. Adhere strictly to any specified character limit. Do not truncate mid-sentence; synthesize the key points to fit naturally within the limit.
5. Provide clear, direct answers suitable for enterprise procurement reviewers.
"""

def build_grounded_user_prompt(
    question: str,
    context_passages: list[dict],
    char_limit: int | None = None,
    section_label: str | None = None,
    tone: str = "professional",
) -> str:
    """Builds the prompt provided to the LLM."""
    passages_text = "\n\n".join(
        [
            f"--- SOURCE [{p.get('doc', 'Doc')} | {p.get('section', 'General')}] ---\n{p.get('snippet', p.get('content', ''))}"
            for p in context_passages
        ]
    )

    limit_instruction = (
        f"\nSTRICT CONSTRAINT: Your answer MUST NOT exceed {char_limit} characters."
        if char_limit
        else ""
    )
    section_context = (
        f"\nSURROUNDING SECTION: {section_label}" if section_label else ""
    )

    return f"""QUESTION:
{question}
{section_context}

CONTEXT PASSAGES:
{passages_text}
{limit_instruction}

Answer the question directly and concisely based solely on the context passages above:"""
