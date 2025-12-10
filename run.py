#!/usr/bin/env python3
"""Entry point to run the TaskNotes application."""
import uvicorn

if __name__ == "__main__":
    print("🚀 Starting TaskNotes...")
    print("📁 Markdown files stored in: data/nodes/")
    print("🌐 Open http://localhost:8000 in your browser")
    print("-" * 40)
    
    uvicorn.run(
        "backend.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["backend", "frontend"]
    )
