import os
import json

from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import Header
from anthropic import Anthropic
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

from backend.agents.business_agent import business_analyst_node
from backend.agents.developer_agent import developer_node
from backend.agents.qa_agent import qa_node
from backend.agents.security_agent import security_node
from backend.agents.ux_agent import ux_node
from backend.agents.orchestrator_agent import orchestrator_node
from backend.agents.pipeline import spec_pipeline
from backend.database.db import save_project, save_specification


load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="SpecForge API",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

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

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded. You can generate 3 specs per hour. Please try again later."
        }
    )


class IdeaRequest(BaseModel):
    idea: str


@app.get("/")
def root():
    return {"message": "SpecForge backend is running"}


@app.post("/generate-spec")
@limiter.limit("3/hour")
async def generate_spec(
    request: Request,
    body: IdeaRequest,
    x_user_api_key: str = Header(None, alias="X-User-API-Key")
):

    api_key = x_user_api_key

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Please provide your Anthropic API key to generate a spec."
        )

    try:
        test_client = Anthropic(api_key=api_key)
        test_client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=10,
            messages=[{"role": "user", "content": "hi"}]
        )
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail="Invalid Anthropic API key. Please check it and try again."
        )

    try:
        result = spec_pipeline.invoke({
            "idea": body.idea,
            "business_analysis": None,
            "dev_concerns": None,
            "qa_concerns": None,
            "security_concerns": None,
            "ux_concerns": None,
            "final_spec": None,
            "api_key": api_key
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")

    project_id = save_project(
        user_id="anonymous",
        title=body.idea[:80],
        idea=body.idea
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
@limiter.limit("3/hour")
async def generate_spec_stream(
    request: Request,
    body: IdeaRequest,
    x_user_api_key: str = Header(None, alias="X-User-API-Key")
):

    api_key = x_user_api_key

    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Please provide your Anthropic API key to generate a spec."
        )

    async def event_generator():

        state = {
            "idea": body.idea,
            "api_key": api_key,
            "business_analysis": None,
            "dev_concerns": None,
            "qa_concerns": None,
            "security_concerns": None,
            "ux_concerns": None,
            "final_spec": None
        }

        agents = [
            ("business",     business_analyst_node, "business_analysis"),
            ("developer",    developer_node,        "dev_concerns"),
            ("qa",           qa_node,               "qa_concerns"),
            ("security",     security_node,         "security_concerns"),
            ("ux",           ux_node,               "ux_concerns"),
            ("orchestrator", orchestrator_node,     "final_spec"),
        ]

        for agent_name, agent_fn, output_key in agents:

            yield f"data: {json.dumps({'type': 'status', 'agent': agent_name, 'status': 'running'})}\n\n"

            state = agent_fn(state)

            output = state.get(output_key)

            yield f"data: {json.dumps({'type': 'result', 'agent': agent_name, 'data': output})}\n\n"

        try:
            project_id = save_project(
                user_id="anonymous",
                title=body.idea[:80],
                idea=body.idea
            )
            save_specification(project_id, state)
            yield f"data: {json.dumps({'type': 'done', 'project_id': project_id})}\n\n"

        except Exception:
            yield f"data: {json.dumps({'type': 'done', 'project_id': None})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
        }
    )