"""Main FastAPI application."""
import asyncio
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pathlib import Path

from .database import engine, Base, SessionLocal, NODES_DIR, ensure_additional_columns
from .routers import nodes
from .services.sync_service import sync_from_files
from .services.priority_service import update_all_priorities
from .services.watch_service import watch_markdown_directory

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TaskNotes", description="Task management with linked notes")

# Mount static files
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")

# Templates
templates = Jinja2Templates(directory=FRONTEND_DIR / "templates")

# Include routers
app.include_router(nodes.router)


@app.on_event("startup")
async def startup_event():
    """Sync from markdown files on startup."""
    Base.metadata.create_all(bind=engine)
    ensure_additional_columns()
    db = SessionLocal()
    try:
        # Check if there are any markdown files to sync
        md_files = list(NODES_DIR.glob("*.md"))
        if md_files:
            stats = sync_from_files(db)
            print(f"Synced from files: {stats}")
        
        # Recalculate priorities
        count = update_all_priorities(db)
        print(f"Recalculated {count} node priorities")
    finally:
        db.close()

    # Start background watcher for new markdown files
    app.state.watch_stop_event = asyncio.Event()
    app.state.watch_task = asyncio.create_task(
        watch_markdown_directory(app.state.watch_stop_event)
    )


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Serve main page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/sync")
async def manual_sync():
    """Manually trigger sync from markdown files."""
    db = SessionLocal()
    try:
        stats = sync_from_files(db)
        update_all_priorities(db)
        return {"status": "ok", "stats": stats}
    finally:
        db.close()


@app.on_event("shutdown")
async def shutdown_event():
    """Stop the markdown watcher."""
    stop_event = getattr(app.state, "watch_stop_event", None)
    task = getattr(app.state, "watch_task", None)
    if stop_event:
        stop_event.set()
    if task:
        await task


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}
