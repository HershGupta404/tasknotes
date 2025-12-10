"""API routes for node operations."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..schemas import (
    NodeCreate, NodeUpdate, NodeResponse, FilterParams,
    LinkCreate, LinkResponse
)
from ..services import node_service
from ..services.priority_service import update_all_priorities

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


@router.get("/", response_model=List[NodeResponse])
def list_nodes(
    mode: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[int] = None,
    has_due_date: Optional[bool] = None,
    parent_id: Optional[str] = Query(None, description="Filter by parent. None=root, 'all'=all nodes"),
    sort_by: str = "position",
    sort_desc: bool = False,
    db: Session = Depends(get_db)
):
    """List nodes with optional filtering."""
    filters = FilterParams(
        mode=mode,
        status=status,
        priority=priority,
        has_due_date=has_due_date,
        parent_id=parent_id,
        sort_by=sort_by,
        sort_desc=sort_desc
    )
    nodes = node_service.get_nodes(db, filters)
    
    # Add children count
    for node in nodes:
        node.children_count = len(node.children) if node.children else 0
    
    return nodes


@router.get("/tree")
def get_tree(db: Session = Depends(get_db)):
    """Get full node tree structure."""
    return node_service.build_tree(db)


@router.get("/search")
def search_nodes(
    q: str,
    mode: Optional[str] = None,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """Search nodes by title and content."""
    results = node_service.search_nodes(db, q, mode)
    # Limit results for autocomplete
    return results[:limit]


@router.get("/autocomplete")
def autocomplete_nodes(
    q: str,
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db)
):
    """Fast autocomplete for node titles (for wiki link suggestions)."""
    from ..models import Node
    results = db.query(Node).filter(
        Node.title.ilike(f"%{q}%")
    ).limit(limit).all()
    return [{"id": n.id, "title": n.title, "mode": n.mode} for n in results]


@router.get("/{node_id}", response_model=NodeResponse)
def get_node(node_id: str, db: Session = Depends(get_db)):
    """Get a single node."""
    node = node_service.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node.children_count = len(node.children) if node.children else 0
    return node


@router.get("/{node_id}/children", response_model=List[NodeResponse])
def get_children(node_id: str, db: Session = Depends(get_db)):
    """Get children of a node."""
    children = node_service.get_children(db, node_id)
    for child in children:
        child.children_count = len(child.children) if child.children else 0
    return children


@router.post("/", response_model=NodeResponse)
def create_node(node: NodeCreate, db: Session = Depends(get_db)):
    """Create a new node."""
    created = node_service.create_node(db, node)
    created.children_count = 0
    return created


@router.patch("/{node_id}", response_model=NodeResponse)
def update_node(node_id: str, updates: NodeUpdate, db: Session = Depends(get_db)):
    """Update a node."""
    node = node_service.update_node(db, node_id, updates)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    node.children_count = len(node.children) if node.children else 0
    return node


@router.delete("/{node_id}")
def delete_node(
    node_id: str,
    recursive: bool = True,
    db: Session = Depends(get_db)
):
    """Delete a node."""
    success = node_service.delete_node(db, node_id, recursive)
    if not success:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"status": "deleted"}


@router.post("/{node_id}/move")
def move_node(
    node_id: str,
    new_parent_id: Optional[str] = None,
    position: int = 0,
    db: Session = Depends(get_db)
):
    """Move a node to a new parent/position."""
    node = node_service.move_node(db, node_id, new_parent_id, position)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"status": "moved", "node_id": node.id}


@router.post("/recalculate-priorities")
def recalculate_priorities(db: Session = Depends(get_db)):
    """Recalculate all node priorities."""
    count = update_all_priorities(db)
    return {"status": "ok", "updated": count}


# Link endpoints
@router.get("/{node_id}/links")
def get_node_links(node_id: str, db: Session = Depends(get_db)):
    """Get all links for a node."""
    links = node_service.get_node_links(db, node_id)
    return links


@router.get("/{node_id}/backlinks", response_model=List[NodeResponse])
def get_backlinks(node_id: str, db: Session = Depends(get_db)):
    """Get all nodes that link to this node via wiki links."""
    from ..services.link_parser import get_backlinks
    backlinks = get_backlinks(db, node_id)
    for node in backlinks:
        node.children_count = len(node.children) if node.children else 0
    return backlinks


@router.get("/{node_id}/dependencies")
def get_dependencies(node_id: str, db: Session = Depends(get_db)):
    """Get dependencies for a node (tasks that block this task and tasks blocked by this task)."""
    from ..models import NodeLink

    # Tasks this node depends on (blocking tasks)
    blocking = db.query(NodeLink).filter(
        NodeLink.source_id == node_id,
        NodeLink.link_type == "dependency"
    ).all()

    # Tasks that depend on this node (blocked tasks)
    blocked = db.query(NodeLink).filter(
        NodeLink.target_id == node_id,
        NodeLink.link_type == "dependency"
    ).all()

    blocking_nodes = [node_service.get_node(db, link.target_id) for link in blocking]
    blocked_nodes = [node_service.get_node(db, link.source_id) for link in blocked]

    return {
        "blocking": [{"id": n.id, "title": n.title, "status": n.status, "priority": n.priority} for n in blocking_nodes if n],
        "blocked_by": [{"id": n.id, "title": n.title, "status": n.status, "priority": n.priority} for n in blocked_nodes if n]
    }


@router.post("/links", response_model=LinkResponse)
def create_link(link: LinkCreate, db: Session = Depends(get_db)):
    """Create a link between nodes."""
    created = node_service.create_link(db, link.source_id, link.target_id, link.link_type)
    if not created:
        raise HTTPException(status_code=400, detail="Could not create link")
    return created


@router.delete("/links/{link_id}")
def delete_link(link_id: str, db: Session = Depends(get_db)):
    """Delete a link."""
    success = node_service.delete_link(db, link_id)
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"status": "deleted"}
