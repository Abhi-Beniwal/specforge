import json
import logging
import re

from typing import (
    Dict,
    Any
)


# =========================================
# LOGGING CONFIGURATION
# =========================================

logging.basicConfig(

    level=logging.INFO,

    format=(
        "%(asctime)s | "
        "%(levelname)s | "
        "%(message)s"
    )
)

logger = logging.getLogger(
    "specforge"
)


# =========================================
# JSON EXTRACTION
# =========================================

def extract_json(
    text: str
) -> Dict[str, Any]:

    if not text:

        raise ValueError(
            "Empty response received"
        )

    logger.info(
        f"RAW MODEL RESPONSE:\n{text}"
    )

    # =====================================
    # REMOVE MARKDOWN CODE BLOCKS
    # =====================================

    cleaned = re.sub(
        r"```json|```",
        "",
        text
    ).strip()

    # =====================================
    # FIND JSON OBJECT
    # =====================================

    start = cleaned.find("{")

    end = cleaned.rfind("}")

    if start == -1 or end == -1:

        logger.error(
            f"NO JSON FOUND:\n{cleaned}"
        )

        raise ValueError(
            "No valid JSON object found"
        )

    json_text = cleaned[start:end + 1]

    # =====================================
    # CLEAN COMMON JSON ISSUES
    # =====================================

    json_text = re.sub(
        r",\s*}",
        "}",
        json_text
    )

    json_text = re.sub(
        r",\s*]",
        "]",
        json_text
    )

    # =====================================
    # REMOVE INVALID CONTROL CHARS
    # =====================================

    json_text = re.sub(
        r"[\x00-\x1F\x7F]",
        "",
        json_text
    )

    # =====================================
    # VALIDATE JSON COMPLETENESS
    # =====================================

    if not json_text.strip().endswith("}"):

        logger.error(
            f"INCOMPLETE JSON:\n"
            f"{json_text}"
        )

        raise ValueError(
            "Incomplete JSON response"
        )

    # =====================================
    # PARSE JSON
    # =====================================

    try:

        parsed = json.loads(
            json_text
        )

        if not isinstance(
            parsed,
            dict
        ):

            raise ValueError(
                "JSON root must be object"
            )

        return parsed

    except json.JSONDecodeError as e:

        logger.error(
            f"FAILED JSON:\n{json_text}"
        )

        raise ValueError(
            f"Invalid JSON format: {e}"
        )


# =========================================
# TOKEN COST ESTIMATION
# =========================================

def estimate_cost(
    input_tokens: int,
    output_tokens: int
) -> float:

    # Claude Sonnet Pricing Approximation

    input_cost = (
        input_tokens / 1_000_000
    ) * 3

    output_cost = (
        output_tokens / 1_000_000
    ) * 15

    total_cost = (
        input_cost + output_cost
    )

    return round(
        total_cost,
        6
    )