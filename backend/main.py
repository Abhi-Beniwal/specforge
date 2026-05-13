from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent / ".env"

load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agents.pipeline import spec_pipeline

load_dotenv()

# =========================================
# FASTAPI INITIALIZATION
# =========================================

app = FastAPI()

# =========================================
# CORS CONFIGURATION
# =========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================
# REQUEST MODEL
# =========================================

class IdeaRequest(BaseModel):

    idea: str

# =========================================
# ROOT ROUTE
# =========================================

@app.get("/")
def root():

    return {
        "message": "SpecForge backend is running"
    }

# =========================================
# MAIN GENERATION ROUTE
# =========================================

@app.post("/generate-spec")
async def generate_spec(
    request: IdeaRequest
):

    # =========================================
    # RUN MULTI-AGENT PIPELINE
    # =========================================

    result = spec_pipeline.invoke({

        "idea": request.idea,

        "business_analysis": None,

        "dev_concerns": None,

        "qa_concerns": None,

        "security_concerns": None,

        "ux_concerns": None,

        "final_spec": None
    })

    # =========================================
    # RETURN FULL MULTI-AGENT OUTPUT
    # =========================================

    return {

        "business_analysis":
            result.get(
                "business_analysis"
            ),

        "dev_concerns":
            result.get(
                "dev_concerns"
            ),

        "qa_concerns":
            result.get(
                "qa_concerns"
            ),

        "security_concerns":
            result.get(
                "security_concerns"
            ),

        "ux_concerns":
            result.get(
                "ux_concerns"
            ),

        "final_spec":
            result.get(
                "final_spec"
            )
    }