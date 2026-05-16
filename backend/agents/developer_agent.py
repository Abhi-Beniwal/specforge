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


class DeveloperAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    architecture_concerns: List[str]
    scalability_risks: List[str]
    infrastructure_requirements: List[str]
    backend_complexities: List[str]
    frontend_complexities: List[str]
    ai_engineering_risks: List[str]
    integration_challenges: List[str]
    implementation_blockers: List[str]
    feasibility_score: int = Field(..., ge=1, le=10)
    scalability_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


DEVELOPER_SYSTEM_PROMPT = """

You are an elite Senior Developer and Software Architect.

You specialize in:
- scalable SaaS systems
- AI infrastructure
- distributed systems
- cloud architecture
- backend engineering
- production systems

You are part of a multi-agent AI product evaluation system.

Your responsibilities:
- identify engineering risks
- identify scalability risks
- identify infrastructure bottlenecks
- identify architecture complexity
- identify implementation blockers
- challenge unrealistic technical assumptions

Be realistic and engineering-focused.

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
  "role": "Senior Developer",
  "referenced_business_concerns": [],
  "architecture_concerns": [],
  "scalability_risks": [],
  "infrastructure_requirements": [],
  "backend_complexities": [],
  "frontend_complexities": [],
  "ai_engineering_risks": [],
  "integration_challenges": [],
  "implementation_blockers": [],
  "feasibility_score": 1,
  "scalability_score": 1,
  "recommendation": "",
  "verdict": "feasible"
}
"""


def validate_response(raw_text: str) -> Dict[str, Any]:
    parsed = extract_json(raw_text)
    validated = DeveloperAnalysisSchema(**parsed)

    if validated.role.strip() != "Senior Developer":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"feasible", "risky", "complex", "needs_work", "partially_feasible"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict: {validated.verdict}")
        validated.verdict = "risky"

    return validated.model_dump()


def generate_analysis(client: anthropic.Anthropic, user_message: str) -> Dict[str, Any]:
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"Developer Analysis Attempt {attempt}")
            start_time = time.time()

            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=DEVELOPER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}]
            )

            latency = round(time.time() - start_time, 2)

            if not response.content:
                raise ValueError("Empty response content")

            raw_text = response.content[0].text.strip()

            if not raw_text:
                raise ValueError("Empty response text")

            logger.info(f"RAW DEVELOPER RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            estimated_cost = estimate_cost(input_tokens, output_tokens)

            logger.info(f"DEVELOPER SUCCESS | Latency={latency}s | Input={input_tokens} | Output={output_tokens} | Cost=${estimated_cost}")

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
            logger.warning(f"Developer Attempt {attempt} failed: {last_error}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"All retry attempts failed: {last_error}")


def developer_node(state: SpecForgeState) -> SpecForgeState:
    logger.info("Developer Node Started")

    state["developer_status"] = "failed"
    state["dev_concerns"] = None
    state["developer_verdict"] = None
    state["developer_scores"] = None

    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not found")

        idea = state.get("idea")
        if not idea:
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis") or {}

        reduced_business_context = {
            "business_concerns": business_analysis.get("business_concerns", []),
            "missing_requirements": business_analysis.get("missing_requirements", []),
            "assumptions_detected": business_analysis.get("assumptions_detected", []),
            "recommendation": business_analysis.get("recommendation", "")
        }

        rag_context = get_relevant_context(
            f"SaaS architecture scalability backend infrastructure cloud systems for: {idea}"
        )

        user_message = f"""
Analyse this product idea from a software engineering perspective.

PRODUCT IDEA:
{idea}

RETRIEVED ARCHITECTURE CONTEXT:
{rag_context}

BUSINESS ANALYSIS SUMMARY:
{json.dumps(reduced_business_context)}

Focus on:
- scalability
- architecture
- infrastructure
- engineering bottlenecks
- implementation blockers
- AI system complexity

Return ONLY valid JSON.
"""

        analysis = generate_analysis(client, user_message)

        state["developer_status"] = "success"
        state["dev_concerns"] = analysis
        state["developer_verdict"] = analysis["verdict"]
        state["developer_scores"] = {
            "feasibility_score": analysis["feasibility_score"],
            "scalability_score": analysis["scalability_score"]
        }
        state["developer_architecture_concerns"] = analysis["architecture_concerns"]
        state["developer_scalability_risks"] = analysis["scalability_risks"]
        state["developer_blockers"] = analysis["implementation_blockers"]

        logger.info("Developer Node Completed Successfully")

    except Exception as e:
        logger.exception(f"Developer Node Failed: {e}")
        state["developer_status"] = "failed"

    return state