from langgraph.graph import StateGraph, END

from .state import SpecForgeState

from .business_agent import business_analyst_node
from .developer_agent import developer_node
from .qa_agent import qa_node
from .security_agent import security_node
from .ux_agent import ux_node
from .orchestrator_agent import orchestrator_node


def build_pipeline():

    # =========================================
    # CREATE GRAPH
    # =========================================

    graph = StateGraph(SpecForgeState)

    # =========================================
    # REGISTER NODES
    # =========================================

    graph.add_node(
        "business",
        business_analyst_node
    )

    graph.add_node(
        "developer",
        developer_node
    )

    graph.add_node(
        "qa",
        qa_node
    )

    graph.add_node(
        "security",
        security_node
    )

    graph.add_node(
        "ux",
        ux_node
    )

    graph.add_node(
        "orchestrator",
        orchestrator_node
    )

    # =========================================
    # EXECUTION FLOW
    # =========================================

    graph.set_entry_point(
        "business"
    )

    graph.add_edge(
        "business",
        "developer"
    )

    graph.add_edge(
        "developer",
        "qa"
    )

    graph.add_edge(
        "qa",
        "security"
    )

    graph.add_edge(
        "security",
        "ux"
    )

    graph.add_edge(
        "ux",
        "orchestrator"
    )

    graph.add_edge(
        "orchestrator",
        END
    )

    # =========================================
    # COMPILE GRAPH
    # =========================================

    return graph.compile()


# =========================================
# GLOBAL PIPELINE INSTANCE
# =========================================

spec_pipeline = build_pipeline()