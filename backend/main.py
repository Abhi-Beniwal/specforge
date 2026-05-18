import os
import json

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from backend.agents.business_agent import business_analyst_node
from backend.agents.developer_agent import developer_node
from backend.agents.qa_agent import qa_node
from backend.agents.security_agent import security_node
from backend.agents.ux_agent import ux_node
from backend.agents.orchestrator_agent import orchestrator_node
from backend.agents.pipeline import spec_pipeline
from backend.database.db import save_project, save_specification


load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


app = FastAPI(
    title="SpecForge API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://specforge-chi.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IdeaRequest(BaseModel):
    idea: str


@app.get("/")
def root():
    return {"message": "SpecForge backend is running"}


@app.post("/generate-spec")
async def generate_spec(request: IdeaRequest):

    result = spec_pipeline.invoke({
        "idea": request.idea,
        "business_analysis": None,
        "dev_concerns": None,
        "qa_concerns": None,
        "security_concerns": None,
        "ux_concerns": None,
        "final_spec": None
    })

    project_id = save_project(
        user_id="anonymous",
        title=request.idea[:80],
        idea=request.idea
    )

    save_specification(project_id, result)

    return {
        "project_id": project_id,
        "business_analysis": result.get("business_analysis"),
        "dev_concerns": result.get("dev_concerns"),
        "qa_concerns": result.get("qa_concerns"),
        "security_concerns": result.get("security_concerns"),
        "ux_concerns": result.get("ux_concerns"),
        "final_spec": result.get("final_spec")
    }


@app.post("/generate-spec-stream")
async def generate_spec_stream(request: IdeaRequest):

    async def event_generator():

        state = {
            "idea": request.idea,
            "business_analysis": None,
            "dev_concerns": None,
            "qa_concerns": None,
            "security_concerns": None,
            "ux_concerns": None,
            "final_spec": None
        }

        agents = [
            ("business", business_analyst_node, "business_analysis"),
            ("developer", developer_node, "dev_concerns"),
            ("qa", qa_node, "qa_concerns"),
            ("security", security_node, "security_concerns"),
            ("ux", ux_node, "ux_concerns"),
            ("orchestrator", orchestrator_node, "final_spec"),
        ]

        for agent_name, agent_fn, output_key in agents:

            yield f"data: {json.dumps({'type': 'status', 'agent': agent_name, 'status': 'running'})}\n\n"

            state = agent_fn(state)

            output = state.get(output_key)

            yield f"data: {json.dumps({'type': 'result', 'agent': agent_name, 'data': output})}\n\n"

        try:
            project_id = save_project(
                user_id="anonymous",
                title=request.idea[:80],
                idea=request.idea
            )
            save_specification(project_id, state)
            yield f"data: {json.dumps({'type': 'done', 'project_id': project_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'done', 'project_id': None})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )