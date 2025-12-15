"""Pydantic schemas for request/response validation."""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Literal


class NodeBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: str = ""
    mode: Literal["task", "note"] = "task"
    status: Literal["todo", "in_progress", "done", "cancelled"] = "todo"
    priority: int = Field(default=3, ge=1, le=5)
    due_date: Optional[datetime] = None
    tags: List[str] = Field(default_factory=list)
    parent_id: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_minutes: int = Field(default=0, ge=0)
    actual_minutes: int = Field(default=0, ge=0)
    difficulty: int = Field(default=3, ge=1, le=5)


class NodeCreate(NodeBase):
    pass


class NodeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = None
    mode: Optional[Literal["task", "note"]] = None
    status: Optional[Literal["todo", "in_progress", "done", "cancelled"]] = None
    priority: Optional[int] = Field(None, ge=1, le=5)
    due_date: Optional[datetime] = None
    tags: Optional[List[str]] = None
    parent_id: Optional[str] = None
    position: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    estimated_minutes: Optional[int] = Field(None, ge=0)
    actual_minutes: Optional[int] = Field(None, ge=0)
    difficulty: Optional[int] = Field(None, ge=1, le=5)


class NodeResponse(NodeBase):
    id: str
    computed_priority: float
    computed_due: Optional[datetime]
    position: int
    created_at: datetime
    updated_at: datetime
    md_filename: Optional[str]
    children_count: int = 0
    
    class Config:
        from_attributes = True


class NodeTreeResponse(NodeResponse):
    """Node with nested children for tree view."""
    children: List["NodeTreeResponse"] = []


class LinkCreate(BaseModel):
    source_id: str
    target_id: str
    link_type: Literal["dependency", "blocks", "reference", "wiki"] = "reference"


class LinkResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    link_type: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class SearchQuery(BaseModel):
    query: str
    mode: Optional[Literal["task", "note", "all"]] = "all"
    status: Optional[str] = None
    has_due_date: Optional[bool] = None


class FilterParams(BaseModel):
    mode: Optional[Literal["task", "note"]] = None
    status: Optional[Literal["todo", "in_progress", "done", "cancelled"]] = None
    priority: Optional[int] = None
    has_due_date: Optional[bool] = None
    tags: Optional[List[str]] = None  # Filter by tags (nodes must have at least ONE of the specified tags)
    parent_id: Optional[str] = None  # None = root nodes, "all" = all nodes
    sort_by: Literal["position", "priority", "due_date", "created_at", "title"] = "position"
    sort_desc: bool = False
