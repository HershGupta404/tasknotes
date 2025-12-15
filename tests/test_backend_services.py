import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database
from backend.models import Base, Node
from backend.schemas import NodeCreate, NodeUpdate
from backend.services import (
    node_service,
    sync_service,
    watch_service,
    due_date_service,
    priority_service,
)
from backend.models import NodeLink
from backend import timezone_service


def make_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return Session()


class BackendServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.nodes_dir = Path(self.tmpdir.name)
        self.nodes_dir.mkdir(exist_ok=True)

        # Save originals to restore later
        self.orig_nodes_dir = database.NODES_DIR
        self.orig_tz_offset = timezone_service.get_timezone_offset_minutes()

        # Point all services to the temp nodes directory
        sync_service.NODES_DIR = self.nodes_dir
        watch_service.NODES_DIR = self.nodes_dir
        database.NODES_DIR = self.nodes_dir
        timezone_service.set_timezone_offset_minutes(0)

        self.db = make_session()

    def tearDown(self):
        self.db.close()
        # Restore original paths
        sync_service.NODES_DIR = self.orig_nodes_dir
        watch_service.NODES_DIR = self.orig_nodes_dir
        database.NODES_DIR = self.orig_nodes_dir
        timezone_service.set_timezone_offset_minutes(self.orig_tz_offset)
        self.tmpdir.cleanup()

    def test_markdown_roundtrip(self):
        node = Node(
            id="abc-123",
            title="Test",
            content="Hello **world**",
            mode="task",
            status="todo",
            priority=2,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        md = sync_service.node_to_markdown(node)
        tmp_file = self.nodes_dir / "roundtrip.md"
        tmp_file.write_text(md, encoding="utf-8")

        data = sync_service.markdown_to_node_data(tmp_file)
        self.assertIsNotNone(data)
        self.assertEqual(data["id"], node.id)
        self.assertEqual(data["title"], node.title)
        self.assertEqual(data["content"].strip(), "Hello **world**")

    def test_sync_from_files_creates_and_updates(self):
        content = """---
id: task-1
title: First Task
mode: task
priority: 2
---
Body
"""
        md_path = self.nodes_dir / "first.md"
        md_path.write_text(content, encoding="utf-8")

        stats = sync_service.sync_from_files(self.db)
        self.assertEqual(stats["created"], 1)
        created = self.db.query(Node).filter(Node.id == "task-1").first()
        self.assertIsNotNone(created)
        self.assertEqual(created.title, "First Task")

        updated_content = """---
id: task-1
title: Updated Task
mode: task
priority: 4
---
Updated body
"""
        md_path.write_text(updated_content, encoding="utf-8")
        stats = sync_service.sync_from_files(self.db)
        self.assertEqual(stats["updated"], 1)

        updated = self.db.query(Node).filter(Node.id == "task-1").first()
        self.assertEqual(updated.title, "Updated Task")
        self.assertEqual(updated.priority, 4)

    def test_create_update_delete_node_syncs_files(self):
        node_data = NodeCreate(title="New Task", mode="task")
        created = node_service.create_node(self.db, node_data)
        expected_path = self.nodes_dir / f"{created.id}.md"

        self.assertTrue(expected_path.exists())

        updated = node_service.update_node(
            self.db,
            created.id,
            NodeUpdate(title="Renamed", content="Updated content")
        )
        self.assertEqual(updated.title, "Renamed")
        self.assertIn("Updated content", expected_path.read_text(encoding="utf-8"))

        deleted = node_service.delete_node(self.db, created.id, recursive=True)
        self.assertTrue(deleted)
        self.assertFalse(expected_path.exists())
        self.assertIsNone(self.db.query(Node).filter(Node.id == created.id).first())

    def test_watch_normalize_assigns_id_and_renames(self):
        raw_md = """---
title: External Note
mode: note
---
Content
"""
        original = self.nodes_dir / "external.md"
        original.write_text(raw_md, encoding="utf-8")

        normalized = watch_service._normalize_markdown_file(original)
        self.assertIsNotNone(normalized)
        self.assertNotEqual(normalized.name, "external.md")
        self.assertTrue(normalized.exists())
        self.assertFalse(original.exists())

        parsed = sync_service.markdown_to_node_data(normalized)
        self.assertIsNotNone(parsed)
        self.assertIsNotNone(parsed["id"])
        self.assertEqual(parsed["title"], "External Note")

    def test_normalize_rejects_missing_frontmatter(self):
        original = self.nodes_dir / "bad.md"
        original.write_text("Just text without frontmatter", encoding="utf-8")
        normalized = watch_service._normalize_markdown_file(original)
        self.assertIsNone(normalized)
        # File should remain (user can fix manually)
        self.assertTrue(original.exists())

    # ----- Priority and due date logic -----
    def test_calculate_urgency_score_overdue_and_future(self):
        now = datetime(2024, 1, 1, tzinfo=timezone.utc)
        overdue = priority_service.calculate_urgency_score(
            datetime(2023, 12, 25, tzinfo=timezone.utc), now=now
        )
        due_soon = priority_service.calculate_urgency_score(
            datetime(2024, 1, 2, tzinfo=timezone.utc), now=now
        )
        future = priority_service.calculate_urgency_score(
            datetime(2024, 2, 1, tzinfo=timezone.utc), now=now
        )
        self.assertGreater(overdue, due_soon)
        self.assertGreater(due_soon, future)

    def test_compute_node_priority_respects_status_and_depth(self):
        todo = Node(id="p1", title="Todo", priority=3, status="todo")
        in_progress = Node(id="p2", title="Child", priority=3, status="in_progress")
        done_node = Node(
            id="p3",
            title="Done",
            priority=1,
            status="done",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        todo_score = priority_service.compute_node_priority(todo, depth=0)
        in_progress_score = priority_service.compute_node_priority(in_progress, depth=2)
        done_score = priority_service.compute_node_priority(done_node, depth=0)

        self.assertGreater(in_progress_score, todo_score)  # in_progress + depth bonus
        self.assertEqual(done_score, 0.0)

    def test_update_all_priorities_walks_tree(self):
        root = Node(id="r", title="Root", priority=3, status="todo")
        child = Node(id="c", title="Child", priority=2, status="todo", parent_id="r")
        self.db.add_all([root, child])
        self.db.commit()

        updated = priority_service.update_all_priorities(self.db)
        self.assertEqual(updated, 2)
        # depth bonus should make child > root
        self.assertGreater(child.computed_priority, root.computed_priority)

    def test_dependency_due_date_propagation(self):
        # preceding <-dependent (source_id=dep, target_id=prec)
        prec = Node(id="prec", title="Preceding", mode="task", due_date=datetime(2024, 1, 2, 12, tzinfo=timezone.utc))
        dep = Node(id="dep", title="Dependent", mode="task", due_date=datetime(2024, 1, 2, 8, tzinfo=timezone.utc))
        link = NodeLink(source_id="dep", target_id="prec", link_type="dependency")
        self.db.add_all([prec, dep, link])
        self.db.commit()

        due_date_service.propagate_dependency_due_dates(self.db, dep)
        self.db.refresh(prec)
        adjusted = prec.due_date
        if adjusted.tzinfo is None:
            adjusted = adjusted.replace(tzinfo=timezone.utc)
        # Preceding should move earlier to maintain gap
        self.assertLess(adjusted, datetime(2024, 1, 2, 10, tzinfo=timezone.utc))

    def test_subtask_due_inheritance_and_parent_adjust(self):
        parent = Node(id="parent", title="Parent", mode="task", due_date=datetime(2024, 1, 5, tzinfo=timezone.utc))
        child = Node(id="child", title="Child", mode="task", parent_id="parent", due_date=datetime(2024, 1, 7, tzinfo=timezone.utc))
        self.db.add_all([parent, child])
        self.db.commit()

        due_date_service.propagate_subtask_due_dates(self.db, child)
        self.db.refresh(parent)
        # Parent should be pushed to latest child
        self.assertEqual(parent.due_date, child.due_date)

    def test_dependency_sets_dependent_when_missing(self):
        prec = Node(id="p1", title="Prec", mode="task", due_date=datetime(2024, 1, 10, tzinfo=timezone.utc))
        dep = Node(id="p2", title="Dep", mode="task")
        link = NodeLink(source_id="p2", target_id="p1", link_type="dependency")
        self.db.add_all([prec, dep, link])
        self.db.commit()

        due_date_service.propagate_dependency_due_dates(self.db, dep)
        expected = prec.due_date + due_date_service.timedelta(hours=2)
        actual = dep.due_date
        if actual.tzinfo is None:
            actual = actual.replace(tzinfo=timezone.utc)
        if expected.tzinfo is None:
            expected = expected.replace(tzinfo=timezone.utc)
        self.assertEqual(actual, expected)

    def test_chore_due_date_sets_to_today(self):
        now = datetime(2024, 1, 1, 10, tzinfo=timezone.utc)
        chore = Node(id="chore", title="Chore", mode="task", priority=5)
        changed = due_date_service.ensure_chore_due_date(chore, now=now)
        self.assertTrue(changed)
        self.assertEqual(
            chore.due_date,
            datetime(2024, 1, 1, 23, 59, tzinfo=timezone.utc)
        )

    def test_chore_due_date_rolls_each_day(self):
        # Set due date to previous day; ensure gets bumped to today
        now = datetime(2024, 1, 2, 8, tzinfo=timezone.utc)
        chore = Node(
            id="chore2",
            title="Chore2",
            mode="task",
            priority=5,
            due_date=datetime(2024, 1, 1, 23, 59, tzinfo=timezone.utc)
        )
        due_date_service.ensure_chore_due_date(chore, now=now)
        self.assertEqual(
            chore.due_date,
            datetime(2024, 1, 2, 23, 59, tzinfo=timezone.utc)
        )

    def test_chore_due_respects_timezone_offset(self):
        timezone_service.set_timezone_offset_minutes(120)  # UTC+2
        now = datetime(2024, 1, 1, 10, tzinfo=timezone.utc)
        chore = Node(id="chore3", title="Chore3", mode="task", priority=5)
        due_date_service.ensure_chore_due_date(chore, now=now)
        expected = datetime(2024, 1, 1, 23, 59, tzinfo=timezone_service.get_timezone())
        self.assertEqual(chore.due_date, expected)

    def test_timezone_service_roundtrip(self):
        timezone_service.set_timezone_offset_minutes(-300)
        self.assertEqual(timezone_service.get_timezone_offset_minutes(), -300)
        tz = timezone_service.get_timezone()
        self.assertEqual(datetime.now(tz).utcoffset().total_seconds(), -300 * 60)


if __name__ == "__main__":
    unittest.main()
