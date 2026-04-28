from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    client = anthropic.Anthropic(api_key=os.getenv("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"))
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"Analyse this idea: {request.idea}"}]
    )
    return {"response": message.content[0].text}