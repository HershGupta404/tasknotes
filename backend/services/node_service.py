"""Node CRUD service."""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from ..models import Node, NodeLink
from ..schemas import NodeCreate, NodeUpdate, FilterParams
from .sync_service import save_node_to_file
from .priority_service import propagate_node_changes, compute_node_priority
from .link_parser import sync_wiki_links, get_backlinks


def get_node(db: Session, node_id: str) -> Optional[Node]:
    """Get a single node by ID."""
    return db.query(Node).filter(Node.id == node_id).first()


def get_nodes(db: Session, filters: FilterParams) -> List[Node]:
    """Get nodes with filtering and sorting."""
    query = db.query(Node)
    
    # Filter by parent (None = root nodes)
    if filters.parent_id != "all":
        query = query.filter(Node.parent_id == filters.parent_id)
    
    # Apply filters
    if filters.mode:
        query = query.filter(Node.mode == filters.mode)
    if filters.status:
        query = query.filter(Node.status == filters.status)
    if filters.priority:
        query = query.filter(Node.priority == filters.priority)
    if filters.has_due_date is not None:
        if filters.has_due_date:
            query = query.filter(Node.due_date.isnot(None))
        else:
            query = query.filter(Node.due_date.is_(None))
    
    # Sort
    sort_col = getattr(Node, filters.sort_by, Node.position)
    if filters.sort_desc:
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())
    
    return query.all()


def get_root_nodes(db: Session) -> List[Node]:
    """Get all root-level nodes (no parent)."""
    return db.query(Node).filter(Node.parent_id.is_(None)).order_by(Node.position).all()


def get_children(db: Session, parent_id: str) -> List[Node]:
    """Get direct children of a node."""
    return db.query(Node).filter(Node.parent_id == parent_id).order_by(Node.position).all()


def build_tree(db: Session, parent_id: Optional[str] = None) -> List[dict]:
    """Recursively build tree structure."""
    nodes = db.query(Node).filter(Node.parent_id == parent_id).order_by(Node.position).all()
    
    result = []
    for node in nodes:
        node_dict = {
            "id": node.id,
            "title": node.title,
            "content": node.content,
            "mode": node.mode,
            "status": node.status,
            "priority": node.priority,
            "due_date": node.due_date,
            "computed_priority": node.computed_priority,
            "computed_due": node.computed_due,
            "position": node.position,
            "created_at": node.created_at,
            "updated_at": node.updated_at,
            "children": build_tree(db, node.id)
        }
        result.append(node_dict)
    
    return result


def create_node(db: Session, node_data: NodeCreate) -> Node:
    """Create a new node and save to markdown."""
    # Get next position for siblings
    max_pos = db.query(func.max(Node.position)).filter(
        Node.parent_id == node_data.parent_id
    ).scalar() or -1
    
    node = Node(
        title=node_data.title,
        content=node_data.content,
        mode=node_data.mode,
        status=node_data.status,
        priority=node_data.priority,
        due_date=node_data.due_date,
        parent_id=node_data.parent_id,
        position=max_pos + 1
    )
    
    # Calculate initial priority
    node.computed_priority = compute_node_priority(node, 0)
    
    db.add(node)
    db.commit()
    db.refresh(node)
    
    # Save to markdown file
    save_node_to_file(node)

    # Sync wiki links from content
    sync_wiki_links(db, node)

    # Propagate changes
    propagate_node_changes(db, node)

    return node


def update_node(db: Session, node_id: str, updates: NodeUpdate) -> Optional[Node]:
    """Update a node and sync to markdown."""
    node = get_node(db, node_id)
    if not node:
        return None
    
    # Apply updates
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(node, field, value)
    
    db.commit()
    db.refresh(node)

    # Sync wiki links if content changed
    if 'content' in update_data:
        sync_wiki_links(db, node)

    # Propagate and save
    propagate_node_changes(db, node)
    save_node_to_file(node)

    return node


def delete_node(db: Session, node_id: str, recursive: bool = True) -> bool:
    """Delete a node. If recursive, delete children too."""
    node = get_node(db, node_id)
    if not node:
        return False
    
    if recursive:
        # Delete all descendants
        children = get_children(db, node_id)
        for child in children:
            delete_node(db, child.id, recursive=True)
    else:
        # Move children to parent
        children = get_children(db, node_id)
        for child in children:
            child.parent_id = node.parent_id
    
    # Delete links
    db.query(NodeLink).filter(
        or_(NodeLink.source_id == node_id, NodeLink.target_id == node_id)
    ).delete()
    
    # Delete markdown file
    from ..database import NODES_DIR
    if node.md_filename:
        md_path = NODES_DIR / node.md_filename
        if md_path.exists():
            md_path.unlink()
    
    db.delete(node)
    db.commit()
    return True


def move_node(db: Session, node_id: str, new_parent_id: Optional[str], new_position: int) -> Optional[Node]:
    """Move a node to a new parent and/or position."""
    node = get_node(db, node_id)
    if not node:
        return None
    
    old_parent_id = node.parent_id
    
    # Update parent
    node.parent_id = new_parent_id
    
    # Reorder siblings at old location
    if old_parent_id != new_parent_id:
        old_siblings = db.query(Node).filter(
            Node.parent_id == old_parent_id,
            Node.id != node_id
        ).order_by(Node.position).all()
        for i, sibling in enumerate(old_siblings):
            sibling.position = i
    
    # Insert at new position
    new_siblings = db.query(Node).filter(
        Node.parent_id == new_parent_id,
        Node.id != node_id
    ).order_by(Node.position).all()
    
    for i, sibling in enumerate(new_siblings):
        if i >= new_position:
            sibling.position = i + 1
        else:
            sibling.position = i
    
    node.position = new_position
    
    db.commit()
    db.refresh(node)
    
    propagate_node_changes(db, node)
    save_node_to_file(node)
    
    return node


def search_nodes(db: Session, query: str, mode: Optional[str] = None) -> List[Node]:
    """Full-text search across nodes."""
    search_query = db.query(Node).filter(
        or_(
            Node.title.ilike(f"%{query}%"),
            Node.content.ilike(f"%{query}%")
        )
    )
    
    if mode and mode != "all":
        search_query = search_query.filter(Node.mode == mode)
    
    return search_query.order_by(Node.computed_priority.desc()).all()


# Link operations
def create_link(db: Session, source_id: str, target_id: str, link_type: str = "reference") -> Optional[NodeLink]:
    """Create a link between two nodes."""
    # Check both nodes exist
    if not get_node(db, source_id) or not get_node(db, target_id):
        return None
    
    # Check for existing link
    existing = db.query(NodeLink).filter(
        NodeLink.source_id == source_id,
        NodeLink.target_id == target_id
    ).first()
    
    if existing:
        existing.link_type = link_type
        db.commit()
        return existing
    
    link = NodeLink(source_id=source_id, target_id=target_id, link_type=link_type)
    db.add(link)
    db.commit()
    db.refresh(link)
    
    # Propagate if dependency
    if link_type == "dependency":
        source = get_node(db, source_id)
        propagate_node_changes(db, source)
    
    return link


def delete_link(db: Session, link_id: str) -> bool:
    """Delete a link."""
    link = db.query(NodeLink).filter(NodeLink.id == link_id).first()
    if not link:
        return False
    
    db.delete(link)
    db.commit()
    return True


def get_node_links(db: Session, node_id: str) -> dict:
    """Get all links for a node (both directions)."""
    outgoing = db.query(NodeLink).filter(NodeLink.source_id == node_id).all()
    incoming = db.query(NodeLink).filter(NodeLink.target_id == node_id).all()
    
    return {
        "outgoing": outgoing,
        "incoming": incoming
    }
