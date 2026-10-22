
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="TechPulse AI Service")


class Item(BaseModel):
    title: str
    url: str = ""
    snippet: str = ""


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "TechPulse AI"
    }


@app.post("/summarize")
async def summarize(item: Item):
    api_key = os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured in ai/.env"
        )

    prompt = (
        "In 2 short sentences, explain what a developer should know "
        "about this item. Use only the information provided. "
        "If information is insufficient, say so rather than inventing facts.\n\n"
        f"Title: {item.title}\n"
        f"URL: {item.url}\n"
        f"Snippet: {item.snippet}"
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 200
        }
    }

    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                endpoint,
                headers={"x-goog-api-key": api_key},
                json=payload
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Gemini request timed out. Please try again."
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Gemini API."
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Gemini API request failed with status "
                f"{response.status_code}. Check the API key, model, "
                "API access, and quota."
            )
        )

    try:
        data = response.json()
        summary = data["candidates"][0]["content"]["parts"][0]["text"]

    except (ValueError, KeyError, IndexError, TypeError):
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an unexpected or empty response."
        )

    return {
        "summary": summary.strip(),
        "ai_generated": True,
        "model": model
    }
