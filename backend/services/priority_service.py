"""Priority and due date propagation service."""
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import Node, NodeLink


def calculate_urgency_score(due_date: Optional[datetime], now: Optional[datetime] = None) -> float:
    """
    Calculate urgency based on due date proximity.
    Returns 0-100 score, higher = more urgent.
    """
    if not due_date:
        return 0.0
    
    now = now or datetime.utcnow()
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


def compute_node_priority(node: Node, depth: int = 0) -> float:
    """
    Compute effective priority score for a node.
    
    Score = (6 - priority) * 20 + urgency_score + depth_bonus
    - priority 1 (highest) -> base 100
    - priority 5 (lowest) -> base 20
    - urgency adds 0-100
    - depth slightly boosts nested tasks (max +10)
    """
    base_priority = (6 - node.priority) * 20  # 20-100
    urgency = calculate_urgency_score(node.due_date or node.computed_due)
    depth_bonus = min(depth * 2, 10)  # Nested tasks get slight boost
    
    # Reduce priority for done/cancelled tasks
    if node.status in ("done", "cancelled"):
        return 0.0
    
    # In-progress tasks get a boost
    in_progress_bonus = 15 if node.status == "in_progress" else 0
    
    return base_priority + urgency + depth_bonus + in_progress_bonus


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
    def process_subtree(parent_id: Optional[str], depth: int) -> int:
        count = 0
        nodes = db.query(Node).filter(Node.parent_id == parent_id).all()
        
        for node in nodes:
            old_priority = node.computed_priority
            node.computed_priority = compute_node_priority(node, depth)
            if node.computed_priority != old_priority:
                count += 1
            
            # Process children
            count += process_subtree(node.id, depth + 1)
        
        return count
    
    count = process_subtree(None, 0)
    db.commit()
    return count


def propagate_node_changes(db: Session, node: Node) -> None:
    """
    Full propagation when a node changes.
    Call this after any node update.
    """
    # Update this node's priority
    node.computed_priority = compute_node_priority(node, 0)
    
    # Propagate due dates
    propagate_due_dates_up(db, node)
    propagate_due_dates_down(db, node)
    propagate_from_dependencies(db, node)
    
    db.commit()
