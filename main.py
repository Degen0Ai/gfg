import os
import re
import json
import base64
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import create_tables, get_db, Meal, Goal

# --- App setup ---
app = FastAPI(title="Food Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()

# --- Pydantic schemas ---
class AnalyzeRequest(BaseModel):
    image_base64: str  # data URL or raw base64


class MealCreate(BaseModel):
    date: str
    name: str
    calories: float
    protein: float
    carbs: float
    fat: float
    fiber: float = 0
    sugar: float = 0
    image_base64: Optional[str] = None
    meal_type: str = "snack"


class GoalUpdate(BaseModel):
    calories: float
    protein: float
    carbs: float
    fat: float


# --- Helper ---
def _strip_base64_prefix(data: str) -> tuple[bytes, str]:
    """Return (raw_bytes, mime_type) from a data URL or plain base64."""
    mime = "image/jpeg"
    if data.startswith("data:"):
        match = re.match(r"data:([^;]+);base64,(.+)", data, re.DOTALL)
        if match:
            mime = match.group(1)
            data = match.group(2)
    raw = base64.b64decode(data)
    return raw, mime


def _parse_gemini_json(text: str) -> dict:
    """Extract JSON from Gemini response, handling markdown code fences."""
    text = text.strip()
    # Strip markdown code fences if present
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    # Find first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


# --- API Routes ---

@app.post("/api/analyze")
async def analyze_food(request: AnalyzeRequest):
    """Send food image to Gemini Vision and return nutritional analysis."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY environment variable is not set. Please configure it to use food analysis."
        )

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        raw_bytes, mime_type = _strip_base64_prefix(request.image_base64)

        prompt = (
            "Analyze this food image and return ONLY a JSON object (no markdown, no explanation) "
            "with these exact fields:\n"
            "{\n"
            '  "name": "descriptive food name",\n'
            '  "calories": number,\n'
            '  "protein": number,\n'
            '  "carbs": number,\n'
            '  "fat": number,\n'
            '  "fiber": number,\n'
            '  "sugar": number,\n'
            '  "serving_size": "description of estimated portion",\n'
            '  "confidence": "high|medium|low"\n'
            "}\n"
            'If you cannot identify food, return {"error": "Cannot identify food in image"}.\n'
            "All numbers should be realistic estimates for the visible portion size. "
            "protein, carbs, fat, fiber, sugar are in grams."
        )

        image_part = {"mime_type": mime_type, "data": raw_bytes}
        response = model.generate_content([prompt, image_part])
        result = _parse_gemini_json(response.text)

        if "error" in result:
            raise HTTPException(status_code=422, detail=result["error"])

        # Ensure all numeric fields are present and are numbers
        required = ["name", "calories", "protein", "carbs", "fat", "fiber", "sugar", "serving_size", "confidence"]
        for field in required:
            if field not in result:
                result[field] = 0 if field not in ("name", "serving_size", "confidence") else ""

        return result

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Failed to parse Gemini response as JSON: {str(e)}")
    except Exception as e:
        error_str = str(e)
        if "API_KEY" in error_str or "api key" in error_str.lower():
            raise HTTPException(status_code=503, detail="Invalid Gemini API key. Please check your GEMINI_API_KEY.")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {error_str}")


@app.get("/api/meals/history")
async def get_meal_history(db: Session = Depends(get_db)):
    """Return last 30 days of daily meal summaries."""
    today = datetime.now().date()
    thirty_days_ago = today - timedelta(days=29)

    rows = (
        db.query(
            Meal.date,
            func.sum(Meal.calories).label("calories"),
            func.sum(Meal.protein).label("protein"),
            func.sum(Meal.carbs).label("carbs"),
            func.sum(Meal.fat).label("fat"),
            func.count(Meal.id).label("meal_count"),
        )
        .filter(Meal.date >= str(thirty_days_ago))
        .group_by(Meal.date)
        .order_by(Meal.date.desc())
        .all()
    )

    return [
        {
            "date": row.date,
            "calories": round(row.calories or 0, 1),
            "protein": round(row.protein or 0, 1),
            "carbs": round(row.carbs or 0, 1),
            "fat": round(row.fat or 0, 1),
            "meal_count": row.meal_count,
        }
        for row in rows
    ]


@app.get("/api/meals")
async def get_meals(date: str, db: Session = Depends(get_db)):
    """Return all meals for a given date (YYYY-MM-DD)."""
    meals = db.query(Meal).filter(Meal.date == date).order_by(Meal.created_at).all()
    return [
        {
            "id": m.id,
            "date": m.date,
            "name": m.name,
            "calories": m.calories,
            "protein": m.protein,
            "carbs": m.carbs,
            "fat": m.fat,
            "fiber": m.fiber,
            "sugar": m.sugar,
            "image_base64": m.image_base64,
            "meal_type": m.meal_type,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in meals
    ]


@app.post("/api/meals")
async def create_meal(meal: MealCreate, db: Session = Depends(get_db)):
    """Save a confirmed meal to the database."""
    db_meal = Meal(
        date=meal.date,
        name=meal.name,
        calories=meal.calories,
        protein=meal.protein,
        carbs=meal.carbs,
        fat=meal.fat,
        fiber=meal.fiber,
        sugar=meal.sugar,
        image_base64=meal.image_base64,
        meal_type=meal.meal_type,
        created_at=datetime.utcnow(),
    )
    db.add(db_meal)
    db.commit()
    db.refresh(db_meal)
    return {
        "id": db_meal.id,
        "date": db_meal.date,
        "name": db_meal.name,
        "calories": db_meal.calories,
        "protein": db_meal.protein,
        "carbs": db_meal.carbs,
        "fat": db_meal.fat,
        "fiber": db_meal.fiber,
        "sugar": db_meal.sugar,
        "meal_type": db_meal.meal_type,
        "created_at": db_meal.created_at.isoformat(),
    }


@app.delete("/api/meals/{meal_id}")
async def delete_meal(meal_id: int, db: Session = Depends(get_db)):
    """Delete a meal by id."""
    meal = db.query(Meal).filter(Meal.id == meal_id).first()
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    db.delete(meal)
    db.commit()
    return {"ok": True}


@app.get("/api/goals")
async def get_goals(db: Session = Depends(get_db)):
    """Return the user's nutrition goals (create defaults if none exist)."""
    goal = db.query(Goal).first()
    if not goal:
        goal = Goal(calories=2000, protein=150, carbs=250, fat=65)
        db.add(goal)
        db.commit()
        db.refresh(goal)
    return {
        "calories": goal.calories,
        "protein": goal.protein,
        "carbs": goal.carbs,
        "fat": goal.fat,
    }


@app.post("/api/goals")
async def save_goals(goals: GoalUpdate, db: Session = Depends(get_db)):
    """Upsert the user's nutrition goals."""
    goal = db.query(Goal).first()
    if goal:
        goal.calories = goals.calories
        goal.protein = goals.protein
        goal.carbs = goals.carbs
        goal.fat = goals.fat
    else:
        goal = Goal(
            calories=goals.calories,
            protein=goals.protein,
            carbs=goals.carbs,
            fat=goals.fat,
        )
        db.add(goal)
    db.commit()
    db.refresh(goal)
    return {
        "calories": goal.calories,
        "protein": goal.protein,
        "carbs": goal.carbs,
        "fat": goal.fat,
    }


# --- Static files (must be after API routes) ---
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve index.html for all non-API routes (SPA fallback)."""
    return FileResponse("static/index.html")


@app.get("/")
async def serve_root():
    return FileResponse("static/index.html")
