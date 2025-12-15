"""SQLAlchemy models for nodes and links."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, Float, DateTime,
    ForeignKey, Boolean, Index, JSON
)
from sqlalchemy.orm import relationship
from .database import Base


def generate_uuid():
    return str(uuid.uuid4())


def utc_now():
    """Return current UTC time with timezone info."""
    return datetime.now(timezone.utc)


class Node(Base):
    """
    Single node type - can be task or note based on mode.
    Supports infinite subtask nesting via parent_id.
    """
    __tablename__ = "nodes"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(500), nullable=False, index=True)
    content = Column(Text, default="")  # Markdown content
    mode = Column(String(20), default="task")  # 'task' | 'note'
    
    # Task-specific fields
    status = Column(String(20), default="todo")  # 'todo' | 'in_progress' | 'done' | 'cancelled'
    priority = Column(Integer, default=3)  # 1 (highest) - 5 (lowest)
    due_date = Column(DateTime, nullable=True)
    tags = Column(JSON, default=list)  # List of tag strings, inherited by subtasks/dependencies
    
    # Computed fields (updated by propagation logic)
    computed_priority = Column(Float, default=0.0)
    computed_due = Column(DateTime, nullable=True)  # Inherited/propagated due date

    # Timing and estimation
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    estimated_minutes = Column(Integer, default=0)
    actual_minutes = Column(Integer, default=0)
    difficulty = Column(Integer, default=3)  # 1 (easiest) - 5 (hardest)
    
    # Hierarchy (for subtasks)
    parent_id = Column(String(36), ForeignKey("nodes.id"), nullable=True)
    position = Column(Integer, default=0)  # Order within siblings
    
    # Metadata
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    # File reference
    md_filename = Column(String(255), unique=True)  # nodes/{uuid}.md
    
    # Relationships - self-referential for hierarchy
    # Note: remote_side tells SQLAlchemy that 'id' is the "one" side
    children = relationship(
        "Node",
        backref="parent",
        remote_side=[id],
        foreign_keys=[parent_id],
        lazy="selectin"
    )
    
    # Index for full-text search on title and content
    __table_args__ = (
        Index("idx_node_parent", "parent_id"),
        Index("idx_node_status", "status"),
        Index("idx_node_mode", "mode"),
        Index("idx_node_due", "due_date"),
    )


class NodeLink(Base):
    """
    Graph edges between nodes - separate from parent/child hierarchy.
    Used for dependencies, references, and cross-linking notes to tasks.
    """
    __tablename__ = "node_links"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_id = Column(String(36), ForeignKey("nodes.id"), nullable=False)
    target_id = Column(String(36), ForeignKey("nodes.id"), nullable=False)
    link_type = Column(String(50), default="reference")  # 'dependency' | 'blocks' | 'reference'

    created_at = Column(DateTime, default=utc_now)
    
    # Relationships
    source = relationship("Node", foreign_keys=[source_id], backref="outgoing_links")
    target = relationship("Node", foreign_keys=[target_id], backref="incoming_links")
    
    __table_args__ = (
        Index("idx_link_source", "source_id"),
        Index("idx_link_target", "target_id"),
    )


class Attachment(Base):
    """File attachments for nodes."""
    __tablename__ = "attachments"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    node_id = Column(String(36), ForeignKey("nodes.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(500), nullable=False)  # Relative to attachments dir
    filetype = Column(String(50))  # 'pdf' | 'image' | 'other'

    created_at = Column(DateTime, default=utc_now)
    
    node = relationship("Node", backref="attachments")
