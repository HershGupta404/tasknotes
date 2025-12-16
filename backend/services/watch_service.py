"""Watch markdown directory for new files and sync them into the database."""
import asyncio
import time
from pathlib import Path
from typing import Optional

import frontmatter
from watchfiles import awatch, Change

from ..database import NODES_DIR, SessionLocal
from ..models import generate_uuid
from .sync_service import sync_from_files
from .priority_service import update_all_priorities


def _normalize_markdown_file(md_path: Path) -> Optional[Path]:
    """
    Ensure a markdown file has YAML frontmatter with an id and filename aligned to that id.
    Returns the normalized path (within NODES_DIR) or None if skipped.
    """
    if md_path.suffix.lower() != ".md":
        return None

    if not md_path.exists():
        return None

    try:
        raw = md_path.read_text(encoding="utf-8")
        has_frontmatter = raw.lstrip().startswith("---")
        post = frontmatter.loads(raw)
    except Exception as exc:
        print(f"[watch] Skipping {md_path}: unable to parse frontmatter ({exc})")
        return None

    if not has_frontmatter and not post.metadata:
        print(f"[watch] Skipping {md_path}: missing YAML frontmatter")
        return None

    metadata = dict(post.metadata)
    node_id = metadata.get("id")

    # If a manual file already has an id, keep it and avoid generating/rewriting a new file
    if node_id:
        metadata.setdefault("title", metadata.get("title", md_path.stem))
        target_path = md_path
        expected_name = f"{node_id}.md"
        if md_path.name != expected_name:
            target_path = NODES_DIR / expected_name
            try:
                md_path.rename(target_path)
            except Exception as exc:
                print(f"[watch] Failed to rename {md_path} to {expected_name}: {exc}")
                return None

        # Persist any metadata defaults without changing the id
        try:
            content = frontmatter.dumps(frontmatter.Post(post.content, **metadata))
            target_path.write_text(content, encoding="utf-8")
        except Exception as exc:
            print(f"[watch] Failed to normalize {target_path}: {exc}")
            return None

        return target_path

    # No id present: generate one and normalize the filename
    node_id = generate_uuid()
    metadata["id"] = node_id
    metadata.setdefault("title", md_path.stem)

    target_path = NODES_DIR / f"{node_id}.md"
    content = frontmatter.dumps(frontmatter.Post(post.content, **metadata))

    try:
        target_path.write_text(content, encoding="utf-8")
    except Exception as exc:
        print(f"[watch] Failed to write normalized file for {md_path}: {exc}")
        return None

    if md_path.resolve() != target_path.resolve():
        try:
            md_path.unlink(missing_ok=True)
        except TypeError:
            # missing_ok not available in older runtimes
            if md_path.exists():
                md_path.unlink()

    return target_path


async def watch_markdown_directory(stop_event: asyncio.Event):
    """Watch the nodes directory for newly added markdown files and sync them."""
    print(f"[watch] Watching for new markdown files in {NODES_DIR}")
    last_processed = {}
    COOLDOWN = 1.5  # seconds
    async for changes in awatch(NODES_DIR, stop_event=stop_event):
        interesting = [
            Path(path) for change, path in changes
            if change in (Change.added, Change.modified) and path.endswith(".md")
        ]
        if not interesting:
            continue

        normalized_any = False
        now = time.monotonic()
        for md_path in interesting:
            if now - last_processed.get(md_path, 0) < COOLDOWN:
                continue
            normalized_path = _normalize_markdown_file(md_path)
            if normalized_path:
                normalized_any = True
                last_processed[md_path] = now

        if not normalized_any:
            continue

        db = SessionLocal()
        try:
            stats = sync_from_files(db)
            update_all_priorities(db)
            print(f"[watch] Synced new files: {stats}")
        except Exception as exc:
            print(f"[watch] Sync failed: {exc}")
        finally:
            db.close()
