from typing import (
    TypedDict,
    Dict,
    Any,
    List,
    Optional
)


class SpecForgeState(
    TypedDict,
    total=False
):

    # =====================================
    # CORE INPUT
    # =====================================

    idea: str

    # =====================================
    # GLOBAL PIPELINE METADATA
    # =====================================

    pipeline_status: Optional[str]

    total_estimated_cost: Optional[float]

    total_pipeline_latency: Optional[float]

    # =====================================
    # BUSINESS ANALYSIS
    # =====================================

    business_analysis: Optional[
        Dict[str, Any]
    ]

    business_analysis_status: Optional[
        str
    ]

    business_verdict: Optional[str]

    business_score: Optional[
        Dict[str, int]
    ]

    business_key_questions: Optional[
        List[str]
    ]

    business_concerns: Optional[
        List[str]
    ]

    business_missing_requirements: Optional[
        List[str]
    ]

    business_assumptions: Optional[
        List[str]
    ]

    business_metadata: Optional[
        Dict[str, Any]
    ]

    # =====================================
    # DEVELOPER ANALYSIS
    # =====================================

    dev_concerns: Optional[
        Dict[str, Any]
    ]

    developer_status: Optional[str]

    developer_verdict: Optional[str]

    developer_scores: Optional[
        Dict[str, int]
    ]

    developer_architecture_concerns: Optional[
        List[str]
    ]

    developer_scalability_risks: Optional[
        List[str]
    ]

    developer_blockers: Optional[
        List[str]
    ]

    developer_metadata: Optional[
        Dict[str, Any]
    ]

    # =====================================
    # QA ANALYSIS
    # =====================================

    qa_concerns: Optional[
        Dict[str, Any]
    ]

    qa_status: Optional[str]

    qa_verdict: Optional[str]

    qa_scores: Optional[
        Dict[str, int]
    ]

    critical_test_areas: Optional[
        List[str]
    ]

    edge_cases: Optional[
        List[str]
    ]

    failure_scenarios: Optional[
        List[str]
    ]

    testing_strategy: Optional[
        List[str]
    ]

    automation_recommendations: Optional[
        List[str]
    ]

    qa_blockers: Optional[
        List[str]
    ]

    missed_technical_risks: Optional[
        List[str]
    ]

    qa_metadata: Optional[
        Dict[str, Any]
    ]

    # =====================================
    # SECURITY ANALYSIS
    # =====================================

    security_concerns: Optional[
        Dict[str, Any]
    ]

    security_status: Optional[str]

    security_verdict: Optional[str]

    security_scores: Optional[
        Dict[str, int]
    ]

    critical_vulnerabilities: Optional[
        List[str]
    ]

    authentication_risks: Optional[
        List[str]
    ]

    authorization_risks: Optional[
        List[str]
    ]

    data_privacy_risks: Optional[
        List[str]
    ]

    api_security_risks: Optional[
        List[str]
    ]

    ai_security_risks: Optional[
        List[str]
    ]

    infrastructure_risks: Optional[
        List[str]
    ]

    compliance_risks: Optional[
        List[str]
    ]

    mitigation_strategies: Optional[
        List[str]
    ]

    security_blockers: Optional[
        List[str]
    ]

    security_metadata: Optional[
        Dict[str, Any]
    ]

    # =====================================
    # UX ANALYSIS
    # =====================================

    ux_concerns: Optional[
        Dict[str, Any]
    ]

    ux_status: Optional[str]

    ux_verdict: Optional[str]

    ux_scores: Optional[
        Dict[str, int]
    ]

    onboarding_issues: Optional[
        List[str]
    ]

    accessibility_concerns: Optional[
        List[str]
    ]

    trust_risks: Optional[
        List[str]
    ]

    usability_breakpoints: Optional[
        List[str]
    ]

    retention_risks: Optional[
        List[str]
    ]

    ux_blockers: Optional[
        List[str]
    ]

    ux_metadata: Optional[
        Dict[str, Any]
    ]

    # =====================================
    # FINAL ORCHESTRATION
    # =====================================

    final_spec: Optional[
        Dict[str, Any]
    ]

    orchestrator_status: Optional[
        str
    ]

    project_viability: Optional[
        str
    ]

    orchestrator_metadata: Optional[
        Dict[str, Any]
    ]

    # =====================================
    # FINAL PRODUCT SUMMARY
    # =====================================

    product_summary: Optional[str]

    target_users: Optional[
        List[str]
    ]

    core_problem_statement: Optional[
        str
    ]

    final_recommendation: Optional[
        str
    ]

    # =====================================
    # FINAL REQUIREMENTS
    # =====================================

    functional_requirements: Optional[
        List[str]
    ]

    non_functional_requirements: Optional[
        List[str]
    ]

    technical_constraints: Optional[
        List[str]
    ]

    business_requirements: Optional[
        List[str]
    ]

    security_requirements: Optional[
        List[str]
    ]

    qa_requirements: Optional[
        List[str]
    ]

    ux_requirements: Optional[
        List[str]
    ]

    # =====================================
    # CROSS-AGENT SYNTHESIS
    # =====================================

    recurring_cross_agent_risks: Optional[
        List[str]
    ]

    implementation_priorities: Optional[
        List[str]
    ]

    launch_risks: Optional[
        List[str]
    ]

    mvp_scope: Optional[
        List[str]
    ]

    future_scope: Optional[
        List[str]
    ]