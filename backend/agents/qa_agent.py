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
MAX_RETRIES = 3
RETRY_DELAY = 2
MAX_TOKENS = 2500


class QAAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    referenced_developer_concerns: List[str]
    missed_technical_risks: List[str]
    critical_test_areas: List[str]
    edge_cases: List[str]
    failure_scenarios: List[str]
    performance_risks: List[str]
    testing_strategy: List[str]
    automation_recommendations: List[str]
    qa_blockers: List[str]
    release_risk_score: int = Field(..., ge=1, le=10)
    testability_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


QA_ENGINEER_SYSTEM_PROMPT = """
You are an elite Senior QA Architect.

You specialize in:
- SaaS reliability
- AI system validation
- automation testing
- performance engineering
- release engineering
- infrastructure testing

You are part of a multi-agent AI evaluation system.

Your responsibilities:
- identify edge cases
- identify failure scenarios
- identify testing complexity
- identify regression risks
- identify operational instability
- identify performance bottlenecks
- identify automation challenges

Be reliability-focused and realistic.

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
  "role": "QA Engineer",
  "referenced_business_concerns": [],
  "referenced_developer_concerns": [],
  "missed_technical_risks": [],
  "critical_test_areas": [],
  "edge_cases": [],
  "failure_scenarios": [],
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

    if validated.role.strip() != "QA Engineer":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"stable", "risky", "unstable", "needs_work", "high_risk"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict: {validated.verdict}")
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

            if not response.content:
                raise ValueError("Empty response content")

            raw_text = response.content[0].text.strip()

            if not raw_text:
                raise ValueError("Empty response text")

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
            logger.warning(f"QA Attempt {attempt} failed: {last_error}")
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

        idea = state.get("idea")
        if not idea:
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis") or {}
        developer_analysis = state.get("dev_concerns") or {}

        reduced_business_context = {
            "business_concerns": business_analysis.get("business_concerns", []),
            "missing_requirements": business_analysis.get("missing_requirements", [])
        }

        reduced_developer_context = {
            "architecture_concerns": developer_analysis.get("architecture_concerns", []),
            "scalability_risks": developer_analysis.get("scalability_risks", []),
            "implementation_blockers": developer_analysis.get("implementation_blockers", [])
        }

        user_message = f"""
Analyse this product idea from a QA and reliability perspective.

PRODUCT IDEA:
{idea}

BUSINESS ANALYSIS SUMMARY:
{json.dumps(reduced_business_context)}

DEVELOPER ANALYSIS SUMMARY:
{json.dumps(reduced_developer_context)}

Focus on:
- failure scenarios
- edge cases
- testing risks
- performance bottlenecks
- operational instability
- automation complexity

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
        state["missed_technical_risks"] = analysis["missed_technical_risks"]
        state["qa_metadata"] = analysis["_meta"]

        logger.info(f"QA Analysis Completed | Verdict={analysis['verdict']}")

    except Exception as e:
        logger.exception(f"QA Engineer Node Failed: {e}")
        state["qa_status"] = "failed"
        state["qa_concerns"] = {"error": str(e)}

    return state