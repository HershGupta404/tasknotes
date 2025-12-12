"""Service for managing due date inheritance and propagation."""
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.orm import Session

from ..models import Node, NodeLink


def propagate_subtask_due_dates(db: Session, node: Node) -> None:
    """
    Propagate due dates for subtasks:
    1. Subtasks inherit parent's due date if not set
    2. If subtask due date is later than parent, update parent due date

    Args:
        db: Database session
        node: The node that was updated (could be parent or child)
    """
    # Handle case where this node is a subtask
    if node.parent_id:
        parent = db.query(Node).filter(Node.id == node.parent_id).first()
        if parent and parent.mode == 'task':
            # If subtask has no due date, inherit from parent
            if not node.due_date and parent.due_date:
                node.due_date = parent.due_date
                db.flush()

            # If subtask due date is later than parent, update parent
            elif node.due_date and parent.due_date:
                # Ensure both are timezone-aware
                node_due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)
                parent_due = parent.due_date if parent.due_date.tzinfo else parent.due_date.replace(tzinfo=timezone.utc)

                if node_due > parent_due:
                    parent.due_date = node_due
                    db.flush()

            # If parent has no due date but subtask does, set parent due date
            elif node.due_date and not parent.due_date:
                parent.due_date = node.due_date
                db.flush()

    # Handle case where this node is a parent - propagate to children
    if node.mode == 'task':
        children = db.query(Node).filter(
            Node.parent_id == node.id,
            Node.mode == 'task'
        ).all()

        for child in children:
            # If child has no due date, inherit from parent
            if not child.due_date and node.due_date:
                child.due_date = node.due_date
                db.flush()

            # If child due date is later than parent, update parent
            elif child.due_date and node.due_date:
                child_due = child.due_date if child.due_date.tzinfo else child.due_date.replace(tzinfo=timezone.utc)
                node_due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)

                if child_due > node_due:
                    node.due_date = child_due
                    db.flush()


def propagate_dependency_due_dates(db: Session, node: Node) -> None:
    """
    Propagate due dates for dependencies:
    1. Dependent tasks must be due at least 2 hours after their preceding task
    2. If dependent task is set earlier, update preceding task due date

    Args:
        db: Database session
        node: The node that was updated
    """
    MIN_GAP = timedelta(hours=2)

    # Find dependencies where this node is the dependent task (source)
    blocking_links = db.query(NodeLink).filter(
        NodeLink.source_id == node.id,
        NodeLink.link_type == "dependency"
    ).all()

    for link in blocking_links:
        preceding_task = db.query(Node).filter(Node.id == link.target_id).first()
        if not preceding_task or preceding_task.mode != 'task':
            continue

        # If dependent task has no due date, set it to preceding + 2 hours
        if not node.due_date and preceding_task.due_date:
            prec_due = preceding_task.due_date if preceding_task.due_date.tzinfo else preceding_task.due_date.replace(tzinfo=timezone.utc)
            node.due_date = prec_due + MIN_GAP
            db.flush()

        # If dependent task due date is before preceding + 2 hours, update preceding
        elif node.due_date and preceding_task.due_date:
            node_due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)
            prec_due = preceding_task.due_date if preceding_task.due_date.tzinfo else preceding_task.due_date.replace(tzinfo=timezone.utc)

            if node_due < prec_due + MIN_GAP:
                # Set preceding task to be 2 hours before dependent task
                preceding_task.due_date = node_due - MIN_GAP
                db.flush()
                # Recursively propagate in case this affects other dependencies
                propagate_dependency_due_dates(db, preceding_task)

        # If only dependent has due date, set preceding to 2 hours before
        elif node.due_date and not preceding_task.due_date:
            node_due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)
            preceding_task.due_date = node_due - MIN_GAP
            db.flush()

    # Find dependencies where this node is the preceding task (target)
    dependent_links = db.query(NodeLink).filter(
        NodeLink.target_id == node.id,
        NodeLink.link_type == "dependency"
    ).all()

    for link in dependent_links:
        dependent_task = db.query(Node).filter(Node.id == link.source_id).first()
        if not dependent_task or dependent_task.mode != 'task':
            continue

        # If preceding task has due date but dependent doesn't, set dependent
        if node.due_date and not dependent_task.due_date:
            node_due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)
            dependent_task.due_date = node_due + MIN_GAP
            db.flush()

        # If both have due dates, ensure minimum gap
        elif node.due_date and dependent_task.due_date:
            node_due = node.due_date if node.due_date.tzinfo else node.due_date.replace(tzinfo=timezone.utc)
            dep_due = dependent_task.due_date if dependent_task.due_date.tzinfo else dependent_task.due_date.replace(tzinfo=timezone.utc)

            if dep_due < node_due + MIN_GAP:
                dependent_task.due_date = node_due + MIN_GAP
                db.flush()
                # Recursively propagate in case this affects other dependencies
                propagate_dependency_due_dates(db, dependent_task)


def propagate_all_due_dates(db: Session, node: Node) -> None:
    """
    Apply all due date propagation rules.

    Args:
        db: Database session
        node: The node that was created or updated
    """
    # Apply subtask inheritance first
    propagate_subtask_due_dates(db, node)

    # Then apply dependency constraints
    propagate_dependency_due_dates(db, node)

    # Commit changes
    db.commit()
