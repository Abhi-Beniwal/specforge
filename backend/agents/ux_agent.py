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


class UXAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    referenced_developer_concerns: List[str]
    referenced_qa_concerns: List[str]
    referenced_security_concerns: List[str]
    agreements_with_previous_agents: List[str]
    disagreements_with_previous_agents: List[str]
    missed_user_experience_risks: List[str]
    target_user_risks: List[str]
    onboarding_issues: List[str]
    accessibility_concerns: List[str]
    trust_and_transparency_risks: List[str]
    usability_breakpoints: List[str]
    cognitive_load_risks: List[str]
    user_assumption_failures: List[str]
    user_journey_gaps: List[str]
    ux_research_recommendations: List[str]
    user_testing_recommendations: List[str]
    retention_risks: List[str]
    ux_blockers: List[str]
    usability_score: int = Field(..., ge=1, le=10)
    accessibility_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


UX_RESEARCHER_SYSTEM_PROMPT = """
You are an elite UX Researcher and Product Experience Strategist.

You specialize in:
- UX research
- SaaS product usability
- onboarding systems
- accessibility design
- AI product UX
- human-computer interaction
- behavioral design
- trust and transparency systems

You are participating in a multi-agent product evaluation system.
Previous agents: Business Analyst, Senior Developer, QA Engineer, Security Engineer have already analysed the product.

Your responsibilities:
- identify onboarding friction
- identify usability risks
- analyse accessibility barriers
- analyse user trust concerns
- identify cognitive overload
- identify retention risks
- identify adoption barriers
- identify UX issues caused by technical/security decisions

Be user-focused and realistic. Do NOT blindly support ideas.

IMPORTANT RESPONSE RULES:
Return ONLY raw valid JSON.
Do NOT use markdown, ```json, explanations, comments, headings, or notes.
Keep responses concise. Maximum 3-5 items per array.
Keep descriptions under 2 sentences.

Required JSON structure:
{
  "role": "UX Researcher",
  "referenced_business_concerns": [],
  "referenced_developer_concerns": [],
  "referenced_qa_concerns": [],
  "referenced_security_concerns": [],
  "agreements_with_previous_agents": [],
  "disagreements_with_previous_agents": [],
  "missed_user_experience_risks": [],
  "target_user_risks": [],
  "onboarding_issues": [],
  "accessibility_concerns": [],
  "trust_and_transparency_risks": [],
  "usability_breakpoints": [],
  "cognitive_load_risks": [],
  "user_assumption_failures": [],
  "user_journey_gaps": [],
  "ux_research_recommendations": [],
  "user_testing_recommendations": [],
  "retention_risks": [],
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

    if validated.role != "UX Researcher":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"user_friendly", "friction_heavy", "high_ux_risk", "poor_ux", "moderate_ux_risk", "needs_work"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict received: {validated.verdict}")
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
            raw_text = response.content[0].text.strip()

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
            logger.warning(f"UX Analysis Attempt {attempt} failed: {last_error}")
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
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not found")

        if not state.get("idea"):
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis", {})
        dev_concerns = state.get("dev_concerns", {})
        qa_concerns = state.get("qa_concerns", {})
        security_concerns = state.get("security_concerns", {})

        user_message = f"""
Analyse this product idea from a UX and usability perspective.

PRODUCT IDEA:
{state['idea']}

BUSINESS ANALYSIS:
{json.dumps(business_analysis, indent=2)}

DEVELOPER ANALYSIS:
{json.dumps(dev_concerns, indent=2)}

QA ANALYSIS:
{json.dumps(qa_concerns, indent=2)}

SECURITY ANALYSIS:
{json.dumps(security_concerns, indent=2)}

Focus on:
- onboarding friction
- usability risks
- accessibility concerns
- trust issues
- adoption barriers
- retention risks
- cognitive overload
- UX problems caused by security/technical decisions

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
        state["ux_agreements"] = analysis["agreements_with_previous_agents"]
        state["ux_disagreements"] = analysis["disagreements_with_previous_agents"]
        state["missed_ux_risks"] = analysis["missed_user_experience_risks"]
        state["ux_metadata"] = analysis["_meta"]

        logger.info(f"UX Analysis Completed | Verdict={analysis['verdict']}")

    except Exception as e:
        logger.exception("UX Researcher Node Failed")
        state["ux_status"] = "failed"
        state["ux_concerns"] = {"error": str(e)}

    return state