"""Simple timezone storage for chore and date handling."""
from datetime import timezone, timedelta
from pathlib import Path
from typing import Optional

from .database import DATA_DIR

_offset_minutes: int = 0
_tz_file = DATA_DIR / "timezone.txt"


def _load() -> None:
    global _offset_minutes
    if _tz_file.exists():
        try:
            _offset_minutes = int(_tz_file.read_text().strip())
        except Exception:
            _offset_minutes = 0


def _persist() -> None:
    try:
        _tz_file.write_text(str(_offset_minutes))
    except Exception:
        pass


def get_timezone_offset_minutes() -> int:
    return _offset_minutes


def get_timezone() -> timezone:
    return timezone(timedelta(minutes=_offset_minutes))


def set_timezone_offset_minutes(offset: int) -> None:
    global _offset_minutes
    _offset_minutes = int(offset)
    _persist()


_load()
