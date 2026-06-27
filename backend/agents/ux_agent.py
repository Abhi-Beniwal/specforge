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
MAX_TOKENS = 4000


class UXAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    referenced_developer_concerns: List[str]
    referenced_security_concerns: List[str]
    onboarding_issues: List[str]
    accessibility_concerns: List[str]
    trust_and_transparency_risks: List[str]
    usability_breakpoints: List[str]
    cognitive_load_risks: List[str]
    user_journey_gaps: List[str]
    retention_risks: List[str]
    ux_research_recommendations: List[str]
    user_testing_recommendations: List[str]
    ux_blockers: List[str]
    usability_score: int = Field(..., ge=1, le=10)
    accessibility_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


UX_RESEARCHER_SYSTEM_PROMPT = """
You are an elite UX Researcher and Product Experience Strategist.

You specialize in:
- SaaS usability
- onboarding systems
- AI product UX
- accessibility design
- behavioral UX
- trust and transparency systems
- human-computer interaction

You are part of a multi-agent AI evaluation system.

Your responsibilities:
- identify onboarding friction
- identify usability risks
- identify accessibility barriers
- identify trust issues
- identify adoption barriers
- identify cognitive overload
- identify retention risks

Be realistic and user-focused.

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
  "role": "UX Researcher",
  "referenced_business_concerns": [],
  "referenced_developer_concerns": [],
  "referenced_security_concerns": [],
  "onboarding_issues": [],
  "accessibility_concerns": [],
  "trust_and_transparency_risks": [],
  "usability_breakpoints": [],
  "cognitive_load_risks": [],
  "user_journey_gaps": [],
  "retention_risks": [],
  "ux_research_recommendations": [],
  "user_testing_recommendations": [],
  "ux_blockers": [],
  "usability_score": 1,
  "accessibility_score": 1,
  "recommendation": "",
  "verdict": "user_friendly"
}
"""


def validate_response(raw_text: str) -> Dict[str, Any]:
    parsed = extract_json(raw_text)
    validated = UXAnalysisSchema(**parsed)

    if validated.role.strip() != "UX Researcher":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"user_friendly", "friction_heavy", "high_ux_risk", "poor_ux", "needs_work"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict: {validated.verdict}")
        validated.verdict = "friction_heavy"

    return validated.model_dump()


def generate_analysis(client: anthropic.Anthropic, user_message: str) -> Dict[str, Any]:
    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"UX Analysis Attempt {attempt}")
            start_time = time.time()

            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=UX_RESEARCHER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}]
            )

            latency = round(time.time() - start_time, 2)

            if not response.content:
                raise ValueError("Empty response content")

            raw_text = response.content[0].text.strip()

            if not raw_text:
                raise ValueError("Empty response text")

            logger.info(f"RAW UX RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            estimated_cost = estimate_cost(input_tokens, output_tokens)

            logger.info(f"UX SUCCESS | Latency={latency}s | Input={input_tokens} | Output={output_tokens} | Cost=${estimated_cost}")

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
            logger.warning(f"UX Attempt {attempt} failed: {last_error}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"All retry attempts failed: {last_error}")


def ux_node(state: SpecForgeState) -> SpecForgeState:
    logger.info("UX Researcher Node Started")

    state["ux_status"] = "failed"
    state["ux_concerns"] = None
    state["ux_verdict"] = None
    state["ux_scores"] = None

    try:
        api_key = state.get("api_key") or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("No Anthropic API key available")

        idea = state.get("idea")
        if not idea:
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis") or {}
        developer_analysis = state.get("dev_concerns") or {}
        security_analysis = state.get("security_concerns") or {}

        reduced_business_context = {
            "business_concerns": business_analysis.get("business_concerns", [])
        }

        reduced_developer_context = {
            "frontend_complexities": developer_analysis.get("frontend_complexities", []),
            "integration_challenges": developer_analysis.get("integration_challenges", [])
        }

        reduced_security_context = {
            "authentication_risks": security_analysis.get("authentication_risks", []),
            "compliance_risks": security_analysis.get("compliance_risks", [])
        }

        user_message = f"""
Analyse this product idea from a UX and usability perspective.

PRODUCT IDEA:
{idea}

BUSINESS ANALYSIS SUMMARY:
{json.dumps(reduced_business_context)}

DEVELOPER ANALYSIS SUMMARY:
{json.dumps(reduced_developer_context)}

SECURITY ANALYSIS SUMMARY:
{json.dumps(reduced_security_context)}

Focus on:
- onboarding friction
- usability risks
- accessibility barriers
- trust issues
- adoption challenges
- cognitive overload
- retention risks

Return ONLY valid JSON.
"""

        analysis = generate_analysis(client, user_message)

        state["ux_status"] = "success"
        state["ux_concerns"] = analysis
        state["ux_verdict"] = analysis["verdict"]
        state["ux_scores"] = {
            "usability_score": analysis["usability_score"],
            "accessibility_score": analysis["accessibility_score"]
        }
        state["onboarding_issues"] = analysis["onboarding_issues"]
        state["accessibility_concerns"] = analysis["accessibility_concerns"]
        state["trust_risks"] = analysis["trust_and_transparency_risks"]
        state["usability_breakpoints"] = analysis["usability_breakpoints"]
        state["retention_risks"] = analysis["retention_risks"]
        state["ux_blockers"] = analysis["ux_blockers"]
        state["ux_metadata"] = analysis["_meta"]

        logger.info(f"UX Analysis Completed | Verdict={analysis['verdict']}")

    except Exception as e:
        logger.exception(f"UX Researcher Node Failed: {e}")
        state["ux_status"] = "failed"
        state["ux_concerns"] = {"error": str(e)}

    return state