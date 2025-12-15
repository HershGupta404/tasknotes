"""Database configuration and session management."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

# Database location
DATA_DIR = Path(__file__).parent.parent / "data"
DB_PATH = DATA_DIR / "tasknotes.db"
NODES_DIR = DATA_DIR / "nodes"
ATTACHMENTS_DIR = DATA_DIR / "attachments"
ARCHIVE_DIR = DATA_DIR / "archived"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
NODES_DIR.mkdir(exist_ok=True)
ATTACHMENTS_DIR.mkdir(exist_ok=True)
ARCHIVE_DIR.mkdir(exist_ok=True)

# SQLite with FTS5 support
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency for FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_additional_columns():
    """Ensure newly added columns exist in the nodes table (SQLite)."""
    desired = {
        "started_at": "DATETIME",
        "completed_at": "DATETIME",
        "estimated_minutes": "INTEGER DEFAULT 0",
        "actual_minutes": "INTEGER DEFAULT 0",
        "difficulty": "INTEGER DEFAULT 3",
    }
    with engine.begin() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(nodes)")}
        for col, ddl in desired.items():
            if col not in existing:
                conn.exec_driver_sql(f"ALTER TABLE nodes ADD COLUMN {col} {ddl}")
