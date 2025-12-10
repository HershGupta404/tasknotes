"""SQLAlchemy models for nodes and links."""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, Float, DateTime, 
    ForeignKey, Boolean, Index
)
from sqlalchemy.orm import relationship
from .database import Base


def generate_uuid():
    return str(uuid.uuid4())


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
    
    # Computed fields (updated by propagation logic)
    computed_priority = Column(Float, default=0.0)
    computed_due = Column(DateTime, nullable=True)  # Inherited/propagated due date
    
    # Hierarchy (for subtasks)
    parent_id = Column(String(36), ForeignKey("nodes.id"), nullable=True)
    position = Column(Integer, default=0)  # Order within siblings
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # File reference
    md_filename = Column(String(255), unique=True)  # nodes/{uuid}.md
    
    # Relationships - self-referential for hierarchy
    # Note: remote_side tells SQLAlchemy that 'id' is the "one" side
    children = relationship(
        "Node",
        backref="parent",
        remote_side="Node.id",
        foreign_keys="Node.parent_id",
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
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
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
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    node = relationship("Node", backref="attachments")
