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
from backend.rag.setup import get_relevant_context


load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

MODEL_NAME = "claude-sonnet-4-6"
MAX_RETRIES = 3
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
    recurring_cross_agent_risks: List[str]
    implementation_priorities: List[str]
    mvp_scope: List[str]
    future_scope: List[str]
    launch_risks: List[str]
    final_recommendation: str
    project_viability: str


ORCHESTRATOR_SYSTEM_PROMPT = """
You are an elite Principal Product Architect and Technical Specification Strategist.

You specialize in:
- SaaS systems
- AI systems
- enterprise architecture
- product strategy
- scalable software systems

You are the FINAL synthesis agent in a multi-agent AI evaluation system.

Your responsibilities:
- synthesize cross-agent insights
- identify recurring risks
- prioritize implementation
- define MVP scope
- define launch blockers
- create a production-ready specification

Be realistic and implementation-focused.

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
  "recurring_cross_agent_risks": [],
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

    if validated.role.strip() != "Orchestrator":
        raise ValueError("Invalid role returned")

    validated.project_viability = validated.project_viability.lower().strip()

    allowed_viability = {"high", "medium", "low", "moderate", "promising", "risky"}

    if validated.project_viability not in allowed_viability:
        logger.warning(f"Unknown viability: {validated.project_viability}")
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

            if not response.content:
                raise ValueError("Empty response content")

            raw_text = response.content[0].text.strip()

            if not raw_text:
                raise ValueError("Empty response text")

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
            logger.warning(f"Orchestrator Attempt {attempt} failed: {last_error}")
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

        idea = state.get("idea")
        if not idea:
            raise ValueError("Missing product idea")

        client = anthropic.Anthropic(api_key=api_key)

        business_analysis = state.get("business_analysis") or {}
        developer_analysis = state.get("dev_concerns") or {}
        qa_analysis = state.get("qa_concerns") or {}
        security_analysis = state.get("security_concerns") or {}
        ux_analysis = state.get("ux_concerns") or {}

        reduced_business_context = {
            "business_concerns": business_analysis.get("business_concerns", []),
            "recommendation": business_analysis.get("recommendation", "")
        }

        reduced_developer_context = {
            "architecture_concerns": developer_analysis.get("architecture_concerns", []),
            "implementation_blockers": developer_analysis.get("implementation_blockers", [])
        }

        reduced_qa_context = {
            "failure_scenarios": qa_analysis.get("failure_scenarios", []),
            "performance_risks": qa_analysis.get("performance_risks", [])
        }

        reduced_security_context = {
            "critical_vulnerabilities": security_analysis.get("critical_vulnerabilities", []),
            "compliance_risks": security_analysis.get("compliance_risks", [])
        }

        reduced_ux_context = {
            "onboarding_issues": ux_analysis.get("onboarding_issues", []),
            "retention_risks": ux_analysis.get("retention_risks", [])
        }

        rag_context = get_relevant_context(
            f"software specification architecture requirements SaaS system design for: {idea}"
        )

        user_message = f"""
Create a final production-ready product specification.

PRODUCT IDEA:
{idea}

SPECIFICATION CONTEXT:
{rag_context}

BUSINESS SUMMARY:
{json.dumps(reduced_business_context)}

DEVELOPER SUMMARY:
{json.dumps(reduced_developer_context)}

QA SUMMARY:
{json.dumps(reduced_qa_context)}

SECURITY SUMMARY:
{json.dumps(reduced_security_context)}

UX SUMMARY:
{json.dumps(reduced_ux_context)}

Focus on:
- recurring risks
- implementation priorities
- MVP scope
- launch blockers
- technical and business feasibility
- security and usability requirements

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
        state["launch_risks"] = analysis["launch_risks"]
        state["mvp_scope"] = analysis["mvp_scope"]
        state["final_recommendation"] = analysis["final_recommendation"]
        state["orchestrator_metadata"] = analysis["_meta"]

        logger.info(f"Orchestrator Node Completed Successfully | Viability={analysis['project_viability']}")

    except Exception as e:
        logger.exception(f"Orchestrator Node Failed: {e}")
        state["orchestrator_status"] = "failed"
        state["final_spec"] = {"error": str(e)}

    return state