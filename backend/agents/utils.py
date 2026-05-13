import json
import logging
import re
from typing import Dict, Any


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

logger = logging.getLogger("specforge")


def extract_json(text: str) -> Dict[str, Any]:

    text = re.sub(r"```json|```", "", text).strip()

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1:
        raise ValueError("No valid JSON object found")

    json_text = text[start:end + 1]

    if not json_text.strip().endswith("}"):
        raise ValueError("Incomplete JSON response")

    json_text = re.sub(r",\s*}", "}", json_text)
    json_text = re.sub(r",\s*]", "]", json_text)

    try:
        return json.loads(json_text)
    except json.JSONDecodeError as e:
        logger.error(f"FAILED JSON:\n{json_text}")
        raise ValueError(f"Invalid JSON format: {e}")


def estimate_cost(input_tokens: int, output_tokens: int) -> float:

    input_cost = (input_tokens / 1_000_000) * 3
    output_cost = (output_tokens / 1_000_000) * 15

    return round(input_cost + output_cost, 6)