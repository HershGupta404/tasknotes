"""Priority and due date propagation service."""
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Set
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import Node, NodeLink
from ..timezone_service import get_timezone
from .due_date_service import ensure_chore_due_date


def calculate_urgency_score(due_date: Optional[datetime], now: Optional[datetime] = None) -> float:
    """
    Calculate urgency based on due date proximity.
    Returns 0-100 score, higher = more urgent.
    """
    if not due_date:
        return 0.0

    # Ensure both datetimes are timezone-aware for comparison
    tz = get_timezone()

    if now is None:
        now = datetime.now(tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=tz)
    else:
        now = now.astimezone(tz)

    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=tz)
    else:
        due_date = due_date.astimezone(tz)

    days_until = (due_date - now).days
    
    if days_until < 0:  # Overdue
        return 100.0 + min(abs(days_until), 30)  # Cap at 130
    elif days_until == 0:  # Due today
        return 95.0
    elif days_until <= 1:
        return 85.0
    elif days_until <= 3:
        return 70.0
    elif days_until <= 7:
        return 50.0
    elif days_until <= 14:
        return 30.0
    elif days_until <= 30:
        return 15.0
    else:
        return 5.0


def compute_node_priority(
    node: Node,
    depth: int = 0,
    dependents: int = 0,
    child_count: int = 0,
    inherited_boost: float = 0.0,
    now: Optional[datetime] = None,
) -> float:
    """
    Compute effective priority score with emphasis: due date > priority > blocking/structure.
    Boost slightly for short estimates; avoid sum-of-children dominating.
    """
    if node.status in ("done", "cancelled"):
        return 0.0

    tz = get_timezone()
    if now is None:
        now = datetime.now(tz)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=tz)
    else:
        now = now.astimezone(tz)

    due = node.due_date or node.computed_due
    urgency = calculate_urgency_score(due, now=now)

    base_priority = (6 - node.priority) * 15  # 15-75
    depth_bonus = min(depth * 2, 8)
    blocking_bonus = min(15, dependents * 6 + child_count * 2)

    estimate_bonus = 0
    mins = getattr(node, "estimated_minutes", 0) or 0
    if mins > 0:
        if mins <= 30:
            estimate_bonus = 8
        elif mins <= 60:
            estimate_bonus = 5
        elif mins <= 120:
            estimate_bonus = 2

    in_progress_bonus = 10 if node.status == "in_progress" else 0

    return base_priority + urgency + depth_bonus + blocking_bonus + estimate_bonus + in_progress_bonus + inherited_boost


def propagate_due_dates_up(db: Session, node: Node) -> None:
    """
    When a child's due date is set, propagate to parent.
    Parent due date = min(children due dates) if not already set earlier.
    """
    if not node.parent_id:
        return
    
    parent = db.query(Node).filter(Node.id == node.parent_id).first()
    if not parent:
        return
    
    # Get earliest due date among siblings
    earliest_child_due = db.query(func.min(Node.due_date)).filter(
        Node.parent_id == parent.id,
        Node.due_date.isnot(None),
        Node.status.notin_(["done", "cancelled"])
    ).scalar()
    
    if earliest_child_due:
        if not parent.due_date or earliest_child_due < parent.due_date:
            parent.computed_due = earliest_child_due
        
    # Recurse up
    propagate_due_dates_up(db, parent)


def propagate_due_dates_down(db: Session, node: Node) -> None:
    """
    When a parent's due date is set, children inherit as max due date.
    """
    effective_due = node.due_date or node.computed_due
    if not effective_due:
        return
    
    children = db.query(Node).filter(
        Node.parent_id == node.id,
        Node.status.notin_(["done", "cancelled"])
    ).all()
    
    for child in children:
        # Child's due can't be after parent's
        if child.due_date and child.due_date > effective_due:
            child.computed_due = effective_due
        elif not child.due_date:
            child.computed_due = effective_due
        
        # Recurse down
        propagate_due_dates_down(db, child)


def propagate_from_dependencies(db: Session, node: Node) -> None:
    """
    Handle dependency constraints.
    If A depends on B (A -> B), A cannot be due before B is due.
    """
    # Get nodes this node depends on
    dependencies = db.query(NodeLink).filter(
        NodeLink.source_id == node.id,
        NodeLink.link_type == "dependency"
    ).all()
    
    for dep in dependencies:
        blocking_node = db.query(Node).filter(Node.id == dep.target_id).first()
        if blocking_node and blocking_node.due_date:
            # This node can't be due before its dependency
            if node.due_date and node.due_date < blocking_node.due_date:
                node.computed_due = blocking_node.due_date


def update_all_priorities(db: Session) -> int:
    """
    Recalculate computed_priority for all nodes.
    Returns count of updated nodes.
    """
    # Precompute maps
    dependency_counts: Dict[str, int] = {}
    dependents_map: Dict[str, List[str]] = {}
    for link in db.query(NodeLink).filter(NodeLink.link_type == "dependency"):
        dependency_counts[link.target_id] = dependency_counts.get(link.target_id, 0) + 1
        dependents_map.setdefault(link.source_id, []).append(link.target_id)  # source depends on target

    child_counts: Dict[str, int] = {}
    child_map: Dict[str, List[str]] = {}
    for parent_id, count in db.query(Node.parent_id, func.count(Node.id)).group_by(Node.parent_id):
        if parent_id:
            child_counts[parent_id] = count
    for child_id, parent_id in db.query(Node.id, Node.parent_id).filter(Node.parent_id.isnot(None)):
        child_map.setdefault(parent_id, []).append(child_id)

    def process_subtree(parent_id: Optional[str], depth: int) -> int:
        count = 0
        nodes = db.query(Node).filter(Node.parent_id == parent_id).all()
        
        for node in nodes:
            ensure_chore_due_date(node)
            old_priority = node.computed_priority
            deps = dependency_counts.get(node.id, 0)
            kids = child_counts.get(node.id, 0)
            node.computed_priority = compute_node_priority(node, depth, dependents=deps, child_count=kids)
            if node.computed_priority != old_priority:
                count += 1
            
            # Process children
            count += process_subtree(node.id, depth + 1)
        
        return count
    
    count = process_subtree(None, 0)

    # Propagate weighted boosts upward (dependencies + hierarchy)
    node_scores = {n.id: n.computed_priority for n in db.query(Node.id, Node.computed_priority, Node.status)}
    node_status = {n.id: n.status for n in db.query(Node.id, Node.status)}

    def accumulate(node_id: str, visited: Set[str], weight: float, targets: Dict[str, float]):
        if weight <= 0.01 or node_id in visited:
            return
        visited.add(node_id)
        targets[node_id] = targets.get(node_id, 0.0) + weight
        # children (hierarchy down)
        for child in child_map.get(node_id, []):
            accumulate(child, visited, weight / 2, targets)
        # blockers (dependency targets)
        for blocker in dependents_map.get(node_id, []):  # node depends on blocker
            accumulate(blocker, visited, weight / 2, targets)

    boosts: Dict[str, float] = {}
    for nid, score in node_scores.items():
        if score <= 0 or node_status.get(nid) in ("done", "cancelled"):
            continue
        visited: Set[str] = set()
        accumulate(nid, visited, score / 2, boosts)

    if boosts:
        for node_id, boost in boosts.items():
            node = db.query(Node).filter(Node.id == node_id).first()
            if node:
                node.computed_priority += boost
    db.commit()
    return count


def propagate_node_changes(db: Session, node: Node) -> None:
    """
    Full propagation when a node changes.
    Call this after any node update.
    """
    # Recompute priorities to reflect structural/dependency changes
    update_all_priorities(db)
    
    # Propagate due dates
    propagate_due_dates_up(db, node)
    propagate_due_dates_down(db, node)
    propagate_from_dependencies(db, node)
    
    db.commit()
