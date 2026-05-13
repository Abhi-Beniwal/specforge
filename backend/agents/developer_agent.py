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
from ..rag.setup import get_relevant_context


load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")


MODEL_NAME = "claude-sonnet-4-6"
MAX_RETRIES = 2
RETRY_DELAY = 2
MAX_TOKENS = 2500


class DeveloperAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    agreements_with_business_analysis: List[str]
    disagreements_with_business_analysis: List[str]
    missed_business_risks: List[str]
    architecture_concerns: List[str]
    scalability_risks: List[str]
    infrastructure_requirements: List[str]
    backend_complexities: List[str]
    frontend_complexities: List[str]
    ai_engineering_risks: List[str]
    integration_challenges: List[str]
    data_flow_risks: List[str]
    technical_unknowns: List[str]
    technical_debt_risks: List[str]
    recommended_architecture_patterns: List[str]
    implementation_blockers: List[str]
    feasibility_score: int = Field(..., ge=1, le=10)
    scalability_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


DEVELOPER_SYSTEM_PROMPT = """
You are an elite Senior Software Architect and Principal Engineer.

You specialize in:
- scalable backend systems
- AI infrastructure
- distributed systems
- cloud architecture
- SaaS engineering
- frontend/backend architecture
- production systems

You are participating in a multi-agent product evaluation system.
The Business Analyst has already analysed the product.

Your responsibilities:
- reference business concerns
- identify engineering risks
- analyse scalability feasibility
- analyse architecture complexity
- identify infrastructure risks
- identify operational bottlenecks
- identify implementation blockers
- challenge unrealistic assumptions

Be engineering-focused and realistic. Do NOT blindly support ideas.

IMPORTANT RESPONSE RULES:
Return ONLY raw valid JSON.
Do NOT use markdown, explanations, comments, headings, or notes.
Keep responses concise. Maximum 3-5 items per array.

Required JSON structure:
{
  "role": "Senior Developer",
  "referenced_business_concerns": [],
  "agreements_with_business_analysis": [],
  "disagreements_with_business_analysis": [],
  "missed_business_risks": [],
  "architecture_concerns": [],
  "scalability_risks": [],
  "infrastructure_requirements": [],
  "backend_complexities": [],
  "frontend_complexities": [],
  "ai_engineering_risks": [],
  "integration_challenges": [],
  "data_flow_risks": [],
  "technical_unknowns": [],
  "technical_debt_risks": [],
  "recommended_architecture_patterns": [],
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

    if validated.role != "Senior Developer":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {
        "feasible",
        "risky",
        "technically_complex",
        "complex",
        "partially_feasible",
        "needs_work"
    }

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict received: {validated.verdict}")
        validated.verdict = "risky"

    return validated.model_dump()


def generate_analysis(
    client: anthropic.Anthropic,
    user_message: str
) -> Dict[str, Any]:

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
                messages=[
                    {
                        "role": "user",
                        "content": user_message
                    }
                ]
            )

            latency = round(time.time() - start_time, 2)

            raw_text = response.content[0].text.strip()

            logger.info(f"RAW DEVELOPER RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)

            output_tokens = getattr(
                response.usage,
                "output_tokens",
                0
            )

            estimated_cost = estimate_cost(
                input_tokens,
                output_tokens
            )

            logger.info(
                f"DEVELOPER SUCCESS | "
                f"Latency={latency}s | "
                f"Input={input_tokens} | "
                f"Output={output_tokens} | "
                f"Cost=${estimated_cost}"
            )

            validated_response["_meta"] = {
                "latency_seconds": latency,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost_usd": estimated_cost,
                "model": MODEL_NAME
            }

            return validated_response

        except (
            anthropic.AnthropicError,
            ValidationError,
            ValueError,
            json.JSONDecodeError
        ) as e:

            last_error = str(e)

            logger.warning(
                f"Developer Analysis Attempt {attempt} failed: {last_error}"
            )

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

        if not state.get("idea"):
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis", {})

        rag_context = get_relevant_context(
            f"SaaS architecture scalability backend infrastructure patterns for: {state['idea']}"
        )

        user_message = f"""
Analyse this product idea from a software engineering perspective.

PRODUCT IDEA:
{state['idea']}

RELEVANT ARCHITECTURE DOCUMENTS:
{rag_context}

BUSINESS ANALYSIS:
{json.dumps(business_analysis, indent=2)}

Focus on:
- scalability risks
- architecture complexity
- infrastructure challenges
- backend/frontend complexity
- implementation blockers
- AI engineering risks
- operational bottlenecks
- unrealistic assumptions

Use the retrieved architecture context in your reasoning.

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

        state["developer_architecture_concerns"] = analysis[
            "architecture_concerns"
        ]

        state["developer_scalability_risks"] = analysis[
            "scalability_risks"
        ]

        state["developer_blockers"] = analysis[
            "implementation_blockers"
        ]

        logger.info("Developer Node Completed Successfully")

        return state

    except Exception as e:

        logger.exception(f"Developer Node Failed: {e}")

        state["developer_status"] = "failed"

        return state