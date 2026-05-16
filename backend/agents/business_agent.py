import anthropic
import os
import json
import time

from pathlib import Path
from typing import Dict, Any, List

from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

from .state import SpecForgeState
from .utils import extract_json, estimate_cost, logger
from rag.setup import get_relevant_context


load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

MODEL_NAME = "claude-sonnet-4-6"
MAX_RETRIES = 3
RETRY_DELAY = 2
MAX_TOKENS = 2500


class BusinessAnalysisSchema(BaseModel):
    role: str
    key_questions: List[str]
    business_concerns: List[str]
    assumptions_detected: List[str]
    missing_requirements: List[str]
    feasibility_score: int = Field(..., ge=1, le=10)
    market_clarity_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


BUSINESS_ANALYST_SYSTEM_PROMPT = """
You are an elite Senior Business Analyst and Product Strategist.

You specialize in:
- SaaS products
- AI systems
- enterprise software
- scalable digital products

You are part of a multi-agent AI product evaluation system.

Your responsibilities:
- identify business risks
- identify weak assumptions
- identify missing requirements
- evaluate monetization feasibility
- evaluate scalability realism
- identify execution blockers
- identify regulatory and business concerns

CRITICAL RESPONSE RULES:
- Return ONLY raw valid JSON
- Do NOT use markdown
- Do NOT use code fences
- Do NOT include explanations or notes
- Do NOT include any text before or after JSON
- Keep arrays concise (maximum 5 items)
- Ensure response is complete valid JSON

Required JSON structure:
{
  "role": "Business Analyst",
  "key_questions": [],
  "business_concerns": [],
  "assumptions_detected": [],
  "missing_requirements": [],
  "feasibility_score": 1,
  "market_clarity_score": 1,
  "recommendation": "",
  "verdict": "promising"
}
"""


def validate_response(raw_text: str) -> Dict[str, Any]:
    parsed = extract_json(raw_text)
    validated = BusinessAnalysisSchema(**parsed)

    if validated.role.strip() != "Business Analyst":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"promising", "needs_clarification", "not_viable", "needs_work", "risky", "unclear"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict: {validated.verdict}")
        validated.verdict = "needs_clarification"

    return validated.model_dump()


def generate_analysis(client: anthropic.Anthropic, user_message: str) -> Dict[str, Any]:
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"Business Analysis Attempt {attempt}")
            start_time = time.time()

            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=BUSINESS_ANALYST_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}]
            )

            latency = round(time.time() - start_time, 2)

            if not response.content:
                raise ValueError("Empty response content")

            raw_text = response.content[0].text.strip()

            if not raw_text:
                raise ValueError("Empty response text")

            logger.info(f"RAW BUSINESS RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            estimated_cost = estimate_cost(input_tokens, output_tokens)

            logger.info(f"BUSINESS SUCCESS | Latency={latency}s | Input={input_tokens} | Output={output_tokens} | Cost=${estimated_cost}")

            validated_response["_meta"] = {
                "latency_seconds": latency,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost_usd": estimated_cost,
                "model": MODEL_NAME
            }

            return validated_response

        except (anthropic.AnthropicError, ValidationError, ValueError, json.JSONDecodeError) as e:
            last_error = str(e)
            logger.warning(f"Business Attempt {attempt} failed: {last_error}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"All retry attempts failed: {last_error}")


def business_analyst_node(state: SpecForgeState) -> SpecForgeState:
    logger.info("Business Analyst Node Started")

    state["business_analysis_status"] = "failed"
    state["business_analysis"] = None
    state["business_verdict"] = None
    state["business_score"] = None

    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not found")

        idea = state.get("idea")
        if not idea:
            raise ValueError("No product idea provided")

        client = anthropic.Anthropic(api_key=api_key)

        rag_context = get_relevant_context(
            f"business scalability SaaS monetization market feasibility startup execution for: {idea}"
        )

        user_message = f"""
Analyse this product idea from a business strategy perspective.

PRODUCT IDEA:
{idea}

RETRIEVED BUSINESS CONTEXT:
{rag_context}

Focus on:
- market viability
- monetization risks
- execution blockers
- scalability realism
- missing business requirements
- weak assumptions

Return ONLY valid JSON.
"""

        analysis = generate_analysis(client, user_message)

        state["business_analysis"] = analysis
        state["business_analysis_status"] = "success"
        state["business_verdict"] = analysis["verdict"]
        state["business_score"] = {
            "feasibility": analysis["feasibility_score"],
            "market_clarity": analysis["market_clarity_score"]
        }
        state["business_key_questions"] = analysis["key_questions"]
        state["business_concerns"] = analysis["business_concerns"]
        state["business_missing_requirements"] = analysis["missing_requirements"]
        state["business_assumptions"] = analysis["assumptions_detected"]

        logger.info("Business Analyst Node Completed Successfully")

    except Exception as e:
        logger.exception(f"Business Analyst Node Failed: {e}")
        state["business_analysis_status"] = "failed"

    return state