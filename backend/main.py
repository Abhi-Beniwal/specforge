from dotenv import load_dotenv

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from .agents.pipeline import spec_pipeline

from .database.db import (
    save_project,
    save_specification
)


env_path = (
    Path(__file__).resolve().parent / ".env"
)

load_dotenv(dotenv_path=env_path)


app = FastAPI(
    title="SpecForge API",
    version="1.0.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IdeaRequest(BaseModel):

    idea: str


@app.get("/")
def root():

    return {
        "message": "SpecForge backend is running"
    }


@app.post("/generate-spec")
async def generate_spec(
    request: IdeaRequest
):

    result = spec_pipeline.invoke(

        {
            "idea": request.idea,

            "business_analysis": None,

            "dev_concerns": None,

            "qa_concerns": None,

            "security_concerns": None,

            "ux_concerns": None,

            "final_spec": None
        }
    )

    project_id = save_project(

        user_id="anonymous",

        title=request.idea[:80],

        idea=request.idea
    )

    save_specification(

        project_id,

        result
    )

    return {

        "project_id": project_id,

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