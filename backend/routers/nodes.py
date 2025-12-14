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
    from ..models import Node
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
        node.children_count = db.query(Node).filter(Node.parent_id == node.id).count()

    return nodes


@router.get("/tree")
def get_tree(db: Session = Depends(get_db)):
    """Get full node tree structure."""
    return node_service.build_tree(db)


@router.get("/graph")
def get_graph(db: Session = Depends(get_db)):
    """Get graph data for visualization (nodes and edges)."""
    from ..models import Node, NodeLink
    from datetime import datetime, timezone

    # Get all nodes
    all_nodes = db.query(Node).all()

    # Build nodes array with metadata for visualization
    nodes = []
    for node in all_nodes:
        # Calculate node size
        if node.mode == 'task':
            # Size based on urgency (closer due date = larger)
            # Range: today = 25, 7+ days = 10
            if node.due_date:
                now = datetime.now(timezone.utc)
                due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)
                days_until = (due - now).days
                # Scale: 0 days = 25, 7+ days = 10
                if days_until <= 0:
                    size = 25
                elif days_until >= 7:
                    size = 10
                else:
                    # Linear interpolation: 25 at 0 days, 10 at 7 days
                    size = 25 - (days_until * 15 / 7)
            else:
                size = 12  # Default size for tasks without due date
        else:
            # Size based on link count
            link_count = db.query(NodeLink).filter(
                (NodeLink.source_id == node.id) | (NodeLink.target_id == node.id)
            ).count()
            size = max(10, min(25, 10 + link_count * 2))

        nodes.append({
            "id": node.id,
            "title": node.title,
            "mode": node.mode,
            "status": node.status,
            "priority": node.priority,
            "parent_id": node.parent_id,
            "due_date": node.due_date.isoformat() if node.due_date else None,
            "tags": node.tags or [],
            "size": size,
            "is_root": node.parent_id is None and node.mode == 'task'
        })

    # Build edges array
    edges = []

    # 1. Parent-child relationships (bidirectional edges for subtasks)
    for node in all_nodes:
        if node.parent_id:
            edges.append({
                "source": node.parent_id,
                "target": node.id,
                "type": "hierarchy",
                "bidirectional": True
            })

    # 2. Wiki links (undirected edges)
    wiki_links = db.query(NodeLink).filter(NodeLink.link_type == "wiki").all()
    for link in wiki_links:
        edges.append({
            "source": link.source_id,
            "target": link.target_id,
            "type": "reference",
            "bidirectional": False
        })

    # 3. Dependencies (unidirectional edges from preceding to dependent)
    dependencies = db.query(NodeLink).filter(NodeLink.link_type == "dependency").all()
    for link in dependencies:
        edges.append({
            "source": link.target_id,  # Preceding task
            "target": link.source_id,  # Dependent task
            "type": "dependency",
            "bidirectional": False
        })

    return {
        "nodes": nodes,
        "edges": edges
    }


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
    from ..models import Node
    node = node_service.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    # Count children using query
    node.children_count = db.query(Node).filter(Node.parent_id == node.id).count()
    return node


@router.get("/{node_id}/children", response_model=List[NodeResponse])
def get_children(node_id: str, db: Session = Depends(get_db)):
    """Get children of a node."""
    from ..models import Node
    children = node_service.get_children(db, node_id)
    for child in children:
        child.children_count = db.query(Node).filter(Node.parent_id == child.id).count()
    return children


@router.post("/", response_model=NodeResponse)
def create_node(node: NodeCreate, db: Session = Depends(get_db)):
    """Create a new node."""
    from ..models import Node
    from ..services.due_date_service import propagate_all_due_dates
    from ..services.tag_service import propagate_all_tags

    created = node_service.create_node(db, node)

    # Propagate due dates if this is a task
    if created.mode == 'task':
        propagate_all_due_dates(db, created)

    # Propagate tags (for both tasks and notes)
    propagate_all_tags(db, created)

    created.children_count = db.query(Node).filter(Node.parent_id == created.id).count()
    return created


@router.patch("/{node_id}", response_model=NodeResponse)
def update_node(node_id: str, updates: NodeUpdate, db: Session = Depends(get_db)):
    """Update a node."""
    from ..models import Node
    from ..services.due_date_service import propagate_all_due_dates
    from ..services.tag_service import propagate_all_tags

    node = node_service.update_node(db, node_id, updates)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Propagate due dates if this is a task and due_date was updated
    if node.mode == 'task' and updates.due_date is not None:
        propagate_all_due_dates(db, node)

    # Propagate tags if tags were updated
    if updates.tags is not None:
        propagate_all_tags(db, node)

    node.children_count = db.query(Node).filter(Node.parent_id == node.id).count()
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
    from ..models import Node
    backlinks = get_backlinks(db, node_id)
    for node in backlinks:
        node.children_count = db.query(Node).filter(Node.parent_id == node.id).count()
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
    from ..services.due_date_service import propagate_dependency_due_dates
    from ..services.tag_service import propagate_dependency_tags

    created = node_service.create_link(db, link.source_id, link.target_id, link.link_type)
    if not created:
        raise HTTPException(status_code=400, detail="Could not create link")

    # Propagate due dates if this is a dependency link
    if link.link_type == "dependency":
        source_node = node_service.get_node(db, link.source_id)
        if source_node and source_node.mode == 'task':
            propagate_dependency_due_dates(db, source_node)

    # Propagate tags for both dependency and wiki links
    source_node = node_service.get_node(db, link.source_id)
    if source_node:
        propagate_dependency_tags(db, source_node)

    return created


@router.delete("/links/{link_id}")
def delete_link(link_id: str, db: Session = Depends(get_db)):
    """Delete a link."""
    success = node_service.delete_link(db, link_id)
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"status": "deleted"}
