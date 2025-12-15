"""Sync service for keeping markdown files and database in sync."""
import frontmatter
from pathlib import Path
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from ..database import NODES_DIR
from ..models import Node
from .due_date_service import ensure_chore_due_date


def node_to_markdown(node: Node) -> str:
    """Convert a node to markdown with YAML frontmatter."""
    metadata = {
        "id": node.id,
        "title": node.title,
        "mode": node.mode,
        "status": node.status,
        "priority": node.priority,
        "parent_id": node.parent_id,
        "position": node.position,
        "created_at": node.created_at.isoformat() if node.created_at else None,
        "updated_at": node.updated_at.isoformat() if node.updated_at else None,
    }
    
    if node.due_date:
        metadata["due_date"] = node.due_date.isoformat()
    
    post = frontmatter.Post(node.content or "", **metadata)
    return frontmatter.dumps(post)


def markdown_to_node_data(filepath: Path) -> Optional[dict]:
    """Parse a markdown file into node data dict."""
    try:
        post = frontmatter.load(filepath)
        
        data = {
            "id": post.get("id"),
            "title": post.get("title", filepath.stem),
            "content": post.content,
            "mode": post.get("mode", "task"),
            "status": post.get("status", "todo"),
            "priority": post.get("priority", 3),
            "parent_id": post.get("parent_id"),
            "position": post.get("position", 0),
            "md_filename": filepath.name,
        }
        
        # Parse dates
        if post.get("due_date"):
            due = post["due_date"]
            if isinstance(due, str):
                data["due_date"] = datetime.fromisoformat(due)
            elif isinstance(due, datetime):
                data["due_date"] = due
                
        if post.get("created_at"):
            created = post["created_at"]
            if isinstance(created, str):
                data["created_at"] = datetime.fromisoformat(created)
            elif isinstance(created, datetime):
                data["created_at"] = created
        
        return data
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return None


def save_node_to_file(node: Node) -> Path:
    """Save node to markdown file. Returns filepath."""
    if not node.md_filename:
        node.md_filename = f"{node.id}.md"
    
    filepath = NODES_DIR / node.md_filename
    content = node_to_markdown(node)
    filepath.write_text(content, encoding="utf-8")
    return filepath


def sync_from_files(db: Session) -> dict:
    """
    Scan markdown files and sync to database.
    Markdown files are source of truth.
    Returns stats about sync operation.
    """
    stats = {"created": 0, "updated": 0, "errors": 0}
    
    for md_file in NODES_DIR.glob("*.md"):
        data = markdown_to_node_data(md_file)
        if not data:
            stats["errors"] += 1
            continue
        
        node_id = data.get("id")
        if not node_id:
            stats["errors"] += 1
            continue
        
        existing = db.query(Node).filter(Node.id == node_id).first()
        
        if existing:
            # Update existing node
            for key, value in data.items():
                if key != "id" and value is not None:
                    setattr(existing, key, value)
            ensure_chore_due_date(existing)
            stats["updated"] += 1
        else:
            # Create new node
            node = Node(**data)
            ensure_chore_due_date(node)
            db.add(node)
            stats["created"] += 1
    
    db.commit()
    return stats


def sync_to_files(db: Session) -> dict:
    """
    Sync all database nodes to markdown files.
    Used for initial export or bulk sync.
    """
    stats = {"written": 0, "errors": 0}
    
    nodes = db.query(Node).all()
    for node in nodes:
        try:
            save_node_to_file(node)
            stats["written"] += 1
        except Exception as e:
            print(f"Error writing {node.id}: {e}")
            stats["errors"] += 1
    
    return stats
