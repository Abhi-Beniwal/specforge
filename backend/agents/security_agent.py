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


class SecurityAnalysisSchema(BaseModel):
    role: str
    referenced_business_concerns: List[str]
    referenced_developer_concerns: List[str]
    referenced_qa_concerns: List[str]
    agreements_with_previous_agents: List[str]
    disagreements_with_previous_agents: List[str]
    missed_security_risks_from_previous_agents: List[str]
    critical_vulnerabilities: List[str]
    attack_vectors: List[str]
    authentication_risks: List[str]
    authorization_risks: List[str]
    data_privacy_risks: List[str]
    infrastructure_risks: List[str]
    api_security_risks: List[str]
    ai_security_risks: List[str]
    compliance_risks: List[str]
    security_recommendations: List[str]
    mitigation_strategies: List[str]
    security_blockers: List[str]
    threat_severity_score: int = Field(..., ge=1, le=10)
    production_security_score: int = Field(..., ge=1, le=10)
    recommendation: str
    verdict: str


SECURITY_ENGINEER_SYSTEM_PROMPT = """
You are an elite Security Architect and Cybersecurity Strategist.

You specialize in:
- cloud security
- application security
- DevSecOps
- API security
- SaaS security
- AI/LLM security
- infrastructure security
- compliance systems
- zero-trust architecture

You are participating in a multi-agent product evaluation system.
Previous agents: Business Analyst, Senior Developer, QA Engineer have already analysed the product.

Your responsibilities:
- identify security vulnerabilities
- analyse attack vectors
- identify authentication risks
- identify authorization risks
- analyse infrastructure exposure
- analyse AI security risks
- identify compliance gaps
- identify privacy risks
- challenge unsafe assumptions

Be security-focused and realistic. Do NOT blindly support ideas.

IMPORTANT RESPONSE RULES:
Return ONLY raw valid JSON.
Do NOT use markdown, ```json, explanations, comments, headings, or notes.
Keep responses concise. Maximum 3-5 items per array.
Keep descriptions under 2 sentences.

Required JSON structure:
{
  "role": "Security Engineer",
  "referenced_business_concerns": [],
  "referenced_developer_concerns": [],
  "referenced_qa_concerns": [],
  "agreements_with_previous_agents": [],
  "disagreements_with_previous_agents": [],
  "missed_security_risks_from_previous_agents": [],
  "critical_vulnerabilities": [],
  "attack_vectors": [],
  "authentication_risks": [],
  "authorization_risks": [],
  "data_privacy_risks": [],
  "infrastructure_risks": [],
  "api_security_risks": [],
  "ai_security_risks": [],
  "compliance_risks": [],
  "security_recommendations": [],
  "mitigation_strategies": [],
  "security_blockers": [],
  "threat_severity_score": 1,
  "production_security_score": 1,
  "recommendation": "",
  "verdict": "secure"
}
"""


def validate_response(raw_text: str) -> Dict[str, Any]:

    parsed = extract_json(raw_text)
    validated = SecurityAnalysisSchema(**parsed)

    if validated.role != "Security Engineer":
        raise ValueError("Invalid role returned")

    validated.verdict = validated.verdict.lower().strip()

    allowed_verdicts = {"secure", "risky", "critical_risk", "high_risk", "unsafe", "needs_work"}

    if validated.verdict not in allowed_verdicts:
        logger.warning(f"Unknown verdict received: {validated.verdict}")
        validated.verdict = "risky"

    return validated.model_dump()


def generate_analysis(client: anthropic.Anthropic, user_message: str) -> Dict[str, Any]:

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):

        try:
            logger.info(f"Security Analysis Attempt {attempt}")

            start_time = time.time()

            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=SECURITY_ENGINEER_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}]
            )

            latency = round(time.time() - start_time, 2)
            raw_text = response.content[0].text.strip()

            logger.info(f"RAW SECURITY RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            estimated_cost = estimate_cost(input_tokens, output_tokens)

            logger.info(f"SECURITY SUCCESS | Latency={latency}s | Input={input_tokens} | Output={output_tokens} | Cost=${estimated_cost}")

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
            logger.warning(f"Security Analysis Attempt {attempt} failed: {last_error}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"All retry attempts failed: {last_error}")


def security_node(state: SpecForgeState) -> SpecForgeState:

    logger.info("Security Engineer Node Started")

    state["security_status"] = "failed"
    state["security_concerns"] = None
    state["security_verdict"] = None
    state["security_scores"] = None

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

        user_message = f"""
Analyse this product idea from a cybersecurity perspective.

PRODUCT IDEA:
{state['idea']}

BUSINESS ANALYSIS:
{json.dumps(business_analysis, indent=2)}

DEVELOPER ANALYSIS:
{json.dumps(dev_concerns, indent=2)}

QA ANALYSIS:
{json.dumps(qa_concerns, indent=2)}

Focus on:
- security vulnerabilities
- authentication risks
- authorization risks
- API security
- infrastructure exposure
- AI attack vectors
- compliance gaps
- privacy risks
- exploitability of failures

Return ONLY valid JSON.
"""

        analysis = generate_analysis(client, user_message)

        state["security_status"] = "success"
        state["security_concerns"] = analysis
        state["security_verdict"] = analysis["verdict"]
        state["security_scores"] = {
            "threat_severity_score": analysis["threat_severity_score"],
            "production_security_score": analysis["production_security_score"]
        }
        state["critical_vulnerabilities"] = analysis["critical_vulnerabilities"]
        state["attack_vectors"] = analysis["attack_vectors"]
        state["authentication_risks"] = analysis["authentication_risks"]
        state["authorization_risks"] = analysis["authorization_risks"]
        state["data_privacy_risks"] = analysis["data_privacy_risks"]
        state["api_security_risks"] = analysis["api_security_risks"]
        state["ai_security_risks"] = analysis["ai_security_risks"]
        state["security_blockers"] = analysis["security_blockers"]
        state["security_agreements"] = analysis["agreements_with_previous_agents"]
        state["security_disagreements"] = analysis["disagreements_with_previous_agents"]
        state["missed_security_risks"] = analysis["missed_security_risks_from_previous_agents"]
        state["security_metadata"] = analysis["_meta"]

        logger.info(f"Security Analysis Completed | Verdict={analysis['verdict']}")

    except Exception as e:
        logger.exception("Security Engineer Node Failed")
        state["security_status"] = "failed"
        state["security_concerns"] = {"error": str(e)}

    return state