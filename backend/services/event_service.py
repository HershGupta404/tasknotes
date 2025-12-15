"""Completion/status change event logging."""
from datetime import datetime
from typing import List
from sqlalchemy.orm import Session

from ..models import CompletionEvent
from ..timezone_service import get_timezone


def log_status_change(db: Session, node_id: str, from_status: str, to_status: str) -> CompletionEvent:
    tz = get_timezone()
    occurred = datetime.now(tz)
    event = CompletionEvent(
        node_id=node_id,
        from_status=from_status,
        to_status=to_status,
        occurred_at=occurred
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_events(db: Session, node_id: str) -> List[CompletionEvent]:
    return (
        db.query(CompletionEvent)
        .filter(CompletionEvent.node_id == node_id)
        .order_by(CompletionEvent.occurred_at.desc())
        .all()
    )
