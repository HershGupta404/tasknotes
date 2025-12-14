"""Service for managing tag inheritance and propagation."""
from typing import List, Set
from sqlalchemy.orm import Session

from ..models import Node, NodeLink


def propagate_subtask_tags(db: Session, node: Node) -> None:
    """
    Propagate tags for subtasks:
    1. Subtasks inherit all tags from parent
    2. When parent tags are updated, propagate to all children recursively

    Args:
        db: Database session
        node: The node that was updated (could be parent or child)
    """
    # Handle case where this node is a subtask - inherit from parent
    if node.parent_id:
        parent = db.query(Node).filter(Node.id == node.parent_id).first()
        if parent:
            # Merge parent tags with existing node tags
            parent_tags = set(parent.tags or [])
            node_tags = set(node.tags or [])
            merged_tags = parent_tags | node_tags
            node.tags = list(merged_tags)
            db.flush()

    # Handle case where this node is a parent - propagate to all children recursively
    children = db.query(Node).filter(Node.parent_id == node.id).all()

    for child in children:
        # Merge parent tags with existing child tags
        parent_tags = set(node.tags or [])
        child_tags = set(child.tags or [])
        merged_tags = parent_tags | child_tags
        child.tags = list(merged_tags)
        db.flush()

        # Recursively propagate to grandchildren
        propagate_subtask_tags(db, child)


def propagate_dependency_tags(db: Session, node: Node) -> None:
    """
    Propagate tags for dependencies:
    1. Dependent tasks inherit all tags from their preceding tasks
    2. When preceding task tags are updated, propagate to dependent tasks

    Args:
        db: Database session
        node: The node that was updated
    """
    # Find dependencies where this node is the dependent task (source)
    # It should inherit tags from its preceding tasks (targets)
    blocking_links = db.query(NodeLink).filter(
        NodeLink.source_id == node.id,
        NodeLink.link_type == "dependency"
    ).all()

    for link in blocking_links:
        preceding_task = db.query(Node).filter(Node.id == link.target_id).first()
        if not preceding_task:
            continue

        # Merge preceding task tags with this node's tags
        preceding_tags = set(preceding_task.tags or [])
        node_tags = set(node.tags or [])
        merged_tags = preceding_tags | node_tags
        node.tags = list(merged_tags)
        db.flush()

    # Find dependencies where this node is the preceding task (target)
    # Propagate tags to all dependent tasks
    dependent_links = db.query(NodeLink).filter(
        NodeLink.target_id == node.id,
        NodeLink.link_type == "dependency"
    ).all()

    for link in dependent_links:
        dependent_task = db.query(Node).filter(Node.id == link.source_id).first()
        if not dependent_task:
            continue

        # Merge this node's tags with dependent task tags
        node_tags = set(node.tags or [])
        dependent_tags = set(dependent_task.tags or [])
        merged_tags = node_tags | dependent_tags
        dependent_task.tags = list(merged_tags)
        db.flush()

        # Recursively propagate in case this affects other dependencies
        propagate_dependency_tags(db, dependent_task)


def propagate_all_tags(db: Session, node: Node) -> None:
    """
    Apply all tag propagation rules.

    Args:
        db: Database session
        node: The node that was created or updated
    """
    # Apply subtask inheritance first
    propagate_subtask_tags(db, node)

    # Then apply dependency inheritance
    propagate_dependency_tags(db, node)

    # Commit changes
    db.commit()
