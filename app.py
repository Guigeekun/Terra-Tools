import os
import webbrowser
from threading import Timer
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from backend.database import (
    gamedata,
    BG_MAP,
    BGM_MAP,
    ASSET_INDEX,
    load_databases,
    build_scenario_lookup,
    build_media_indices,
    build_asset_indices,
    find_local_asset,
    strip_story_markup,
    resolve_section_title,
    get_chapter_stories_by_section,
    get_main_story_section_scenario_index
)
from backend.config import (
    DATA_DIR,
    EXTRACTED_DIR,
    LOCAL_INPUT_DIR,
    STORY_SCENARIO_OFFSET
)
from backend.routers import (
    characters,
    buddies,
    items,
    skills,
    stages,
    audio,
    assets,
    system,
    saves,
    docs
)

# Initialize FastAPI App using lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load databases before launching web server
    print("Loading game data databases...")
    load_databases()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folders
os.makedirs("frontend/dist/assets", exist_ok=True)
app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

# Include modular API routers
app.include_router(characters.router)
app.include_router(buddies.router)
app.include_router(items.router)
app.include_router(skills.router)
app.include_router(stages.router)
app.include_router(audio.router)
app.include_router(assets.router)
app.include_router(system.router)
app.include_router(saves.router)
app.include_router(docs.router)


@app.get('/TerraToolbox.png')
@app.get('/favicon.ico')
def serve_app_icon():
    pub_path = os.path.join("frontend", "public", "TerraToolbox.png")
    if os.path.exists(pub_path):
        return FileResponse(pub_path, media_type="image/png")
    dist_path = os.path.join("frontend", "dist", "TerraToolbox.png")
    if os.path.exists(dist_path):
        return FileResponse(dist_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Icon not found")


@app.get('/')
def index_page():
    """Serve the React single-page application."""
    if os.path.exists('frontend/dist/index.html'):
        return FileResponse('frontend/dist/index.html', headers={"Cache-Control": "no-cache"})
    return HTMLResponse("React frontend not found. Please run 'npm run build' in the 'frontend' directory.", status_code=404)


def open_browser():
    """Open user's default browser to local server port."""
    webbrowser.open_new("http://127.0.0.1:5001/")


if __name__ == "__main__":
    # Automatically open browser in 1.5 seconds
    Timer(1.5, open_browser).start()
    
    # Run local web server
    print("Starting FastAPI web server...")
    uvicorn.run(app, host="127.0.0.1", port=5001)
