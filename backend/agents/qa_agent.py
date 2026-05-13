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


load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")


MODEL_NAME = "claude-sonnet-4-6"
MAX_RETRIES = 2
RETRY_DELAY = 2
MAX_TOKENS = 2500


class QAAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    referenced_developer_concerns: List[str]
    agreements_with_business_analysis: List[str]
    agreements_with_developer_analysis: List[str]
    missed_technical_risks: List[str]
    critical_test_areas: List[str]
    edge_cases: List[str]
    failure_scenarios: List[str]
    security_risks: List[str]
    performance_risks: List[str]
    testing_strategy: List[str]
    automation_recommendations: List[str]
    qa_blockers: List[str]
    release_risk_score: int = Field(..., ge=1, le=10)
    testability_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


QA_ENGINEER_SYSTEM_PROMPT = """
You are an elite Senior QA Architect and Reliability Engineer.

You specialize in:
- enterprise QA systems
- SaaS testing
- AI system validation
- reliability engineering
- infrastructure testing
- automation testing
- performance testing
- release engineering

You are participating in a multi-agent product evaluation system.
Previous agents: Business Analyst, Senior Developer have already analysed the product.

Your responsibilities:
- identify failure scenarios
- identify edge cases
- analyse testing complexity
- analyse reliability risks
- identify performance bottlenecks
- identify regression risks
- identify automation challenges
- challenge unsafe engineering assumptions

Be analytical and reliability-focused. Do NOT blindly support ideas.

IMPORTANT RESPONSE RULES:
Return ONLY raw valid JSON.
Do NOT use markdown, ```json, explanations, comments, headings, or notes.
Keep responses concise. Maximum 3-5 items per array.
Keep descriptions under 2 sentences.

Required JSON structure:
{
  "role": "QA Engineer",
  "referenced_business_concerns": [],
  "referenced_developer_concerns": [],
  "agreements_with_business_analysis": [],
  "agreements_with_developer_analysis": [],
  "missed_technical_risks": [],
  "critical_test_areas": [],
  "edge_cases": [],
  "failure_scenarios": [],
  "security_risks": [],
  "performance_risks": [],
  "testing_strategy": [],
  "automation_recommendations": [],
  "qa_blockers": [],
  "release_risk_score": 1,
  "testability_score": 1,
  "recommendation": "",
  "verdict": "stable"
}
"""


def validate_response(raw_text: str) -> Dict[str, Any]:

    parsed = extract_json(raw_text)
    validated = QAAnalysisSchema(**parsed)

    if validated.role != "QA Engineer":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"stable", "risky", "needs_major_testing", "unstable", "high_risk", "needs_work"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict received: {validated.verdict}")
        validated.verdict = "risky"

    return validated.model_dump()


def generate_analysis(client: anthropic.Anthropic, user_message: str) -> Dict[str, Any]:

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):

        try:
            logger.info(f"QA Analysis Attempt {attempt}")

            start_time = time.time()

            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=QA_ENGINEER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}]
            )

            latency = round(time.time() - start_time, 2)
            raw_text = response.content[0].text.strip()

            logger.info(f"RAW QA RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            estimated_cost = estimate_cost(input_tokens, output_tokens)

            logger.info(f"QA SUCCESS | Latency={latency}s | Input={input_tokens} | Output={output_tokens} | Cost=${estimated_cost}")

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
            logger.warning(f"QA Analysis Attempt {attempt} failed: {last_error}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"All retry attempts failed: {last_error}")


def qa_node(state: SpecForgeState) -> SpecForgeState:

    logger.info("QA Engineer Node Started")

    state["qa_status"] = "failed"
    state["qa_concerns"] = None
    state["qa_verdict"] = None
    state["qa_scores"] = None

    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not found")

        if not state.get("idea"):
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis", {})
        dev_concerns = state.get("dev_concerns", {})

        user_message = f"""
Analyse this product idea from a QA and reliability perspective.

PRODUCT IDEA:
{state['idea']}

BUSINESS ANALYSIS:
{json.dumps(business_analysis, indent=2)}

DEVELOPER ANALYSIS:
{json.dumps(dev_concerns, indent=2)}

Focus on:
- failure scenarios
- testing complexity
- edge cases
- regression risks
- performance risks
- automation challenges
- operational instability
- reliability bottlenecks

Return ONLY valid JSON.
"""

        analysis = generate_analysis(client, user_message)

        state["qa_status"] = "success"
        state["qa_concerns"] = analysis
        state["qa_verdict"] = analysis["verdict"]
        state["qa_scores"] = {
            "release_risk_score": analysis["release_risk_score"],
            "testability_score": analysis["testability_score"]
        }
        state["critical_test_areas"] = analysis["critical_test_areas"]
        state["edge_cases"] = analysis["edge_cases"]
        state["failure_scenarios"] = analysis["failure_scenarios"]
        state["testing_strategy"] = analysis["testing_strategy"]
        state["automation_recommendations"] = analysis["automation_recommendations"]
        state["qa_blockers"] = analysis["qa_blockers"]
        state["qa_agreements_business"] = analysis["agreements_with_business_analysis"]
        state["qa_agreements_developer"] = analysis["agreements_with_developer_analysis"]
        state["missed_technical_risks"] = analysis["missed_technical_risks"]
        state["qa_metadata"] = analysis["_meta"]

        logger.info(f"QA Analysis Completed | Verdict={analysis['verdict']}")

    except Exception as e:
        logger.exception("QA Engineer Node Failed")
        state["qa_status"] = "failed"
        state["qa_concerns"] = {"error": str(e)}

    return state