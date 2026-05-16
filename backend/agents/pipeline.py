from langgraph.graph import (
    StateGraph,
    END
)

from .state import SpecForgeState

from .business_agent import (
    business_analyst_node
)

from .developer_agent import (
    developer_node
)

from .qa_agent import (
    qa_node
)

from .security_agent import (
    security_node
)

from .ux_agent import (
    ux_node
)

from .orchestrator_agent import (
    orchestrator_node
)

from .utils import logger


def safe_node_execution(
    node_function,
    node_name
):

    def wrapper(state):

        try:

            logger.info(
                f"Executing {node_name}"
            )

            return node_function(state)

        except Exception as e:

            logger.exception(
                f"{node_name} crashed: {e}"
            )

            state[f"{node_name}_status"] = (
                "failed"
            )

            return state

    return wrapper


def build_pipeline():

    graph = StateGraph(
        SpecForgeState
    )

    # =====================================
    # REGISTER SAFE NODES
    # =====================================

    graph.add_node(
        "business",
        safe_node_execution(
            business_analyst_node,
            "business"
        )
    )

    graph.add_node(
        "developer",
        safe_node_execution(
            developer_node,
            "developer"
        )
    )

    graph.add_node(
        "qa",
        safe_node_execution(
            qa_node,
            "qa"
        )
    )

    graph.add_node(
        "security",
        safe_node_execution(
            security_node,
            "security"
        )
    )

    graph.add_node(
        "ux",
        safe_node_execution(
            ux_node,
            "ux"
        )
    )

    graph.add_node(
        "orchestrator",
        safe_node_execution(
            orchestrator_node,
            "orchestrator"
        )
    )

    # =====================================
    # EXECUTION FLOW
    # =====================================

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

    return graph.compile()


# =========================================
# GLOBAL PIPELINE INSTANCE
# =========================================

spec_pipeline = build_pipeline()