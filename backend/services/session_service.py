"""Work session tracking service."""
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session

from ..models import WorkSession
from ..timezone_service import get_timezone


def create_session(
    db: Session,
    node_id: str,
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    note: str = "",
) -> WorkSession:
    tz = get_timezone()
    if started_at is None:
        started_at = datetime.now(tz)
    elif started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=tz)
    else:
        started_at = started_at.astimezone(tz)

    duration_minutes = 0
    if ended_at:
        if ended_at.tzinfo is None:
            ended_at = ended_at.replace(tzinfo=tz)
        else:
            ended_at = ended_at.astimezone(tz)
        delta = ended_at - started_at
        duration_minutes = max(0, int(delta.total_seconds() // 60))

    session = WorkSession(
        node_id=node_id,
        started_at=started_at,
        ended_at=ended_at,
        duration_minutes=duration_minutes,
        note=note or "",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_sessions(db: Session, node_id: str) -> List[WorkSession]:
    return (
        db.query(WorkSession)
        .filter(WorkSession.node_id == node_id)
        .order_by(WorkSession.started_at.desc())
        .all()
    )
