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
MAX_TOKENS = 4000


class FinalSpecificationSchema(BaseModel):
    role: str
    product_summary: str
    target_users: List[str]
    core_problem_statement: str
    functional_requirements: List[str]
    non_functional_requirements: List[str]
    technical_constraints: List[str]
    business_requirements: List[str]
    security_requirements: List[str]
    qa_requirements: List[str]
    ux_requirements: List[str]
    cross_agent_conflicts: List[str]
    cross_agent_agreements: List[str]
    recurring_cross_agent_risks: List[str]
    risk_summary: List[str]
    recommended_tech_considerations: List[str]
    implementation_priorities: List[str]
    mvp_scope: List[str]
    future_scope: List[str]
    launch_risks: List[str]
    final_recommendation: str
    project_viability: str


ORCHESTRATOR_SYSTEM_PROMPT = """
You are an elite Principal Product Architect and Technical Specification Strategist.

You specialize in:
- software architecture
- SaaS systems
- AI systems
- enterprise platforms
- technical product strategy
- scalable systems
- product synthesis

You are the FINAL synthesis agent in a multi-agent debate system.
Previous agents: Business Analyst, Senior Developer, QA Engineer, Security Engineer, UX Researcher have already analysed the product.

Your responsibilities:
- synthesize cross-agent insights
- resolve disagreements
- identify recurring risks
- prioritize launch blockers
- define implementation priorities
- define MVP scope
- produce a production-ready specification

Be realistic and implementation-focused. Do NOT blindly summarize outputs.

IMPORTANT RESPONSE RULES:
Return ONLY raw valid JSON.
Do NOT use markdown, ```json, explanations, comments, headings, or notes.
Keep responses concise. Maximum 3-5 items per array.
Keep descriptions under 2 sentences.

Required JSON structure:
{
  "role": "Orchestrator",
  "product_summary": "",
  "target_users": [],
  "core_problem_statement": "",
  "functional_requirements": [],
  "non_functional_requirements": [],
  "technical_constraints": [],
  "business_requirements": [],
  "security_requirements": [],
  "qa_requirements": [],
  "ux_requirements": [],
  "cross_agent_conflicts": [],
  "cross_agent_agreements": [],
  "recurring_cross_agent_risks": [],
  "risk_summary": [],
  "recommended_tech_considerations": [],
  "implementation_priorities": [],
  "mvp_scope": [],
  "future_scope": [],
  "launch_risks": [],
  "final_recommendation": "",
  "project_viability": "medium"
}
"""


def validate_response(raw_text: str) -> Dict[str, Any]:

    parsed = extract_json(raw_text)
    validated = FinalSpecificationSchema(**parsed)

    if validated.role != "Orchestrator":
        raise ValueError("Invalid role returned")

    validated.project_viability = validated.project_viability.lower().strip()

    allowed_viability = {"high", "medium", "low", "moderate", "promising", "risky"}

    if validated.project_viability not in allowed_viability:
        logger.warning(f"Unknown project viability: {validated.project_viability}")
        validated.project_viability = "medium"

    return validated.model_dump()


def generate_analysis(client: anthropic.Anthropic, user_message: str) -> Dict[str, Any]:

    last_error = None

    for attempt in range(1, MAX_RETRIES + 1):

        try:
            logger.info(f"Orchestrator Analysis Attempt {attempt}")

            start_time = time.time()

            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=MAX_TOKENS,
                temperature=0,
                system=ORCHESTRATOR_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}]
            )

            latency = round(time.time() - start_time, 2)
            raw_text = response.content[0].text.strip()

            logger.info(f"RAW ORCHESTRATOR RESPONSE:\n{raw_text}")

            validated_response = validate_response(raw_text)

            input_tokens = getattr(response.usage, "input_tokens", 0)
            output_tokens = getattr(response.usage, "output_tokens", 0)
            estimated_cost = estimate_cost(input_tokens, output_tokens)

            logger.info(f"ORCHESTRATOR SUCCESS | Latency={latency}s | Input={input_tokens} | Output={output_tokens} | Cost=${estimated_cost}")

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
            logger.warning(f"Orchestrator Analysis Attempt {attempt} failed: {last_error}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"All retry attempts failed: {last_error}")


def orchestrator_node(state: SpecForgeState) -> SpecForgeState:

    logger.info("Orchestrator Node Started")

    state["orchestrator_status"] = "failed"
    state["final_spec"] = None
    state["project_viability"] = None

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
        ux_concerns = state.get("ux_concerns", {})

        user_message = f"""
Create a final production-ready product specification.

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

UX ANALYSIS:
{json.dumps(ux_concerns, indent=2)}

Focus on:
- recurring risks
- implementation priorities
- launch blockers
- MVP scope
- business feasibility
- technical feasibility
- security requirements
- usability requirements

Return ONLY valid JSON.
"""

        analysis = generate_analysis(client, user_message)

        state["orchestrator_status"] = "success"
        state["final_spec"] = analysis
        state["project_viability"] = analysis["project_viability"]
        state["product_summary"] = analysis["product_summary"]
        state["target_users"] = analysis["target_users"]
        state["core_problem_statement"] = analysis["core_problem_statement"]
        state["functional_requirements"] = analysis["functional_requirements"]
        state["non_functional_requirements"] = analysis["non_functional_requirements"]
        state["business_requirements"] = analysis["business_requirements"]
        state["technical_constraints"] = analysis["technical_constraints"]
        state["security_requirements"] = analysis["security_requirements"]
        state["qa_requirements"] = analysis["qa_requirements"]
        state["ux_requirements"] = analysis["ux_requirements"]
        state["cross_agent_conflicts"] = analysis["cross_agent_conflicts"]
        state["cross_agent_agreements"] = analysis["cross_agent_agreements"]
        state["recurring_cross_agent_risks"] = analysis["recurring_cross_agent_risks"]
        state["risk_summary"] = analysis["risk_summary"]
        state["recommended_tech_considerations"] = analysis["recommended_tech_considerations"]
        state["implementation_priorities"] = analysis["implementation_priorities"]
        state["launch_risks"] = analysis["launch_risks"]
        state["mvp_scope"] = analysis["mvp_scope"]
        state["future_scope"] = analysis["future_scope"]
        state["final_recommendation"] = analysis["final_recommendation"]
        state["orchestrator_metadata"] = analysis["_meta"]

        logger.info(f"Final Specification Generated | Viability={analysis['project_viability']}")

    except Exception as e:
        logger.exception("Orchestrator Node Failed")
        state["orchestrator_status"] = "failed"
        state["final_spec"] = {"error": str(e)}

    return state