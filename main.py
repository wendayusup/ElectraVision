"""Backend for the electronic-component detector."""

import io
import json
import re
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image
from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "my_model.pt"
COMPONENTS_PATH = BASE_DIR / "data" / "components.json"
PROJECT_IDEAS_PATH = BASE_DIR / "data" / "project_ideas.json"

with COMPONENTS_PATH.open(encoding="utf-8") as components_file:
    COMPONENTS_DOCUMENT = json.load(components_file)
    COMPONENTS_DATA = COMPONENTS_DOCUMENT["components"]
    PROJECT_RECOMMENDATIONS_NOTE = COMPONENTS_DOCUMENT.get(
        "project_recommendations_note", ""
    )

with PROJECT_IDEAS_PATH.open(encoding="utf-8") as project_ideas_file:
    COMPONENT_PROJECT_IDEAS = json.load(project_ideas_file)

app = FastAPI(
    title="ElectraVision AI",
    description="Pemindai komponen elektronika berbasis YOLO",
    version="2.1.0",
)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

model = None
active_model_path = None
active_model_mtime = 0.0


def get_or_load_model():
    """Load or reload the configured model when its file changes."""
    global model, active_model_path, active_model_mtime

    if not MODEL_PATH.is_file():
        return model

    mtime = MODEL_PATH.stat().st_mtime
    path = str(MODEL_PATH)
    if model is not None and active_model_path == path and mtime == active_model_mtime:
        return model

    try:
        print(f"[ElectraVision] Memuat model: {MODEL_PATH}")
        loaded = YOLO(path)
    except Exception as exc:
        print(f"[ElectraVision] Gagal memuat model {MODEL_PATH}: {exc}")
        return model

    model = loaded
    active_model_path = path
    active_model_mtime = mtime
    print(f"[ElectraVision] Kelas model aktif ({len(_class_names(loaded))}): {loaded.names}")
    return model


def _class_names(ai_model=None):
    ai_model = ai_model or model
    if ai_model is None or not hasattr(ai_model, "names"):
        return {}
    names = ai_model.names
    if isinstance(names, dict):
        return {int(class_id): str(name) for class_id, name in names.items()}
    return {class_id: str(name) for class_id, name in enumerate(names)}


def normalize_label(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", label.casefold()).strip("-")


def _component_info(class_id: int, class_name: str, include_project_ideas: bool = False):
    normalized_id = normalize_label(class_name)
    component = COMPONENTS_DATA.get(class_name)
    if component is None:
        return None

    info = {
        **{
            key: value
            for key, value in component.items()
            if include_project_ideas
            or key not in {"project_ideas", "project_recommendation_category"}
        },
        "id": normalized_id,
        "name": component["display_name"],
        "kategori": component["category"],
        "deskripsi": component["function"],
        "class_id": class_id,
    }
    if include_project_ideas:
        info["project_ideas"] = COMPONENT_PROJECT_IDEAS.get(
            class_name, component.get("project_ideas", [])
        )
    return info


def _components(ai_model=None, include_project_ideas: bool = False):
    components = {}
    for class_id, name in _class_names(ai_model).items():
        info = _component_info(class_id, name, include_project_ideas)
        if info is not None:
            components[info["id"]] = info
    return components


def _find_component(component_id: str, ai_model=None, include_project_ideas: bool = False):
    return _components(ai_model, include_project_ideas).get(normalize_label(component_id))


@app.on_event("startup")
async def load_model_on_startup():
    get_or_load_model()


@app.get("/", response_class=HTMLResponse)
async def serve_ui(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/api/model-status")
async def get_model_status():
    ai_model = get_or_load_model()
    names = _class_names(ai_model)
    return JSONResponse(
        content={
            "status": "ready" if ai_model is not None else "waiting_for_model",
            "active_model_path": active_model_path,
            "model_classes": names,
            "target_components_count": len(names),
            "target_components": list(names.values()),
            "message": (
                f"Model aktif: {Path(active_model_path).name}"
                if ai_model is not None
                else f"Model belum tersedia: {MODEL_PATH.name}"
            ),
        }
    )


@app.get("/api/components")
async def list_components():
    ai_model = get_or_load_model()
    components = _components(ai_model)
    return JSONResponse(
        content={
            "status": "success",
            "total": len(components),
            "components": components,
        }
    )


@app.get("/api/components/{comp_id}")
async def get_single_component(comp_id: str):
    info = _find_component(comp_id, get_or_load_model(), include_project_ideas=True)
    if info is not None:
        return JSONResponse(
            content={
                "status": "success",
                "component": info,
                "project_recommendations_note": PROJECT_RECOMMENDATIONS_NOTE,
            }
        )
    return JSONResponse(
        status_code=404,
        content={"status": "error", "message": f"Komponen '{comp_id}' tidak ditemukan dalam model."},
    )


@app.post("/detect")
async def detect_component(
    file: UploadFile = File(...),
    confidence: float = Query(0.20, ge=0.05, le=0.99),
    demo_component: Optional[str] = Query(None),
):
    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = image.size
        ai_model = get_or_load_model()
        detections = []

        if ai_model is not None:
            class_names = _class_names(ai_model)
            results = ai_model.predict(source=image, conf=confidence, imgsz=416, verbose=False)
            for result in results:
                for box in result.boxes:
                    xyxy = box.xyxy[0].tolist()
                    score = float(box.conf[0])
                    class_id = int(box.cls[0])
                    class_name = class_names.get(class_id)
                    if class_name is None:
                        continue

                    info = _component_info(class_id, class_name)
                    if info is None:
                        continue
                    detections.append(
                        {
                            "box": [round(coordinate, 2) for coordinate in xyxy],
                            "label": info["name"],
                            "normalized_id": info["id"],
                            "confidence": round(score * 100, 1),
                            "component_info": info,
                        }
                    )
        elif demo_component:
            info = _find_component(demo_component)
            if info is not None:
                margin_x = img_w * 0.18
                margin_y = img_h * 0.18
                detections.append(
                    {
                        "box": [
                            round(margin_x, 2),
                            round(margin_y, 2),
                            round(img_w - margin_x, 2),
                            round(img_h - margin_y, 2),
                        ],
                        "label": info["name"],
                        "normalized_id": info["id"],
                        "confidence": 98.5,
                        "component_info": info,
                    }
                )

        return JSONResponse(
            content={
                "status": "success",
                "model_ready": ai_model is not None,
                "active_model": active_model_path,
                "detected_count": len(detections),
                "detections": detections,
                "image_size": {"width": img_w, "height": img_h},
            }
        )
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc)},
        )


@app.post("/api/simulate-detection")
async def simulate_detection(component_id: str = Form(...)):
    ai_model = get_or_load_model()
    info = _find_component(component_id, ai_model)
    if info is None:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": f"Komponen '{component_id}' tidak valid."},
        )

    return JSONResponse(
        content={
            "status": "success",
            "model_ready": ai_model is not None,
            "is_simulated": True,
            "detected_count": 1,
            "detections": [
                {
                    "box": [120.0, 80.0, 520.0, 400.0],
                    "label": info["name"],
                    "normalized_id": info["id"],
                    "confidence": 98.6,
                    "component_info": info,
                }
            ],
            "image_size": {"width": 640, "height": 480},
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
