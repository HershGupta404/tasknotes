"""Script to add test data for graph visualization."""
from datetime import datetime, timezone, timedelta
from backend.database import SessionLocal
from backend.models import Node, NodeLink
from backend.services.link_parser import sync_wiki_links


def add_test_data():
    """Add test nodes, tasks, subtasks, and dependencies."""
    db = SessionLocal()

    try:
        # Clear existing data
        db.query(NodeLink).delete()
        db.query(Node).delete()
        db.commit()

        # Create root tasks
        root_task_1 = Node(
            title="Build GraphDB Integration",
            content="Research and implement graph database for better relationship handling.\n\nSee [[Graph Database Comparison]] for analysis.",
            mode="task",
            status="in_progress",
            priority=1,
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
            parent_id=None
        )

        root_task_2 = Node(
            title="Implement User Authentication",
            content="Add OAuth2 authentication with JWT tokens.\n\nReference: [[Security Best Practices]]",
            mode="task",
            status="todo",
            priority=2,
            due_date=datetime.now(timezone.utc) + timedelta(days=14),
            parent_id=None
        )

        root_task_3 = Node(
            title="Performance Optimization",
            content="Optimize query performance and add caching layer.",
            mode="task",
            status="todo",
            priority=3,
            due_date=datetime.now(timezone.utc) + timedelta(days=21),
            parent_id=None
        )

        db.add_all([root_task_1, root_task_2, root_task_3])
        db.commit()

        # Create subtasks for root_task_1
        subtask_1_1 = Node(
            title="Research Neo4j",
            content="Evaluate Neo4j for our use case. Document findings in [[Graph Database Comparison]].",
            mode="task",
            status="done",
            priority=1,
            due_date=datetime.now(timezone.utc) + timedelta(days=2),
            parent_id=root_task_1.id
        )

        subtask_1_2 = Node(
            title="Research ArangoDB",
            content="Evaluate ArangoDB multi-model capabilities.",
            mode="task",
            status="done",
            priority=1,
            due_date=datetime.now(timezone.utc) + timedelta(days=3),
            parent_id=root_task_1.id
        )

        subtask_1_3 = Node(
            title="Implement GraphDB Client",
            content="Build client library for chosen database.",
            mode="task",
            status="in_progress",
            priority=2,
            due_date=datetime.now(timezone.utc) + timedelta(days=5),
            parent_id=root_task_1.id
        )

        # Create subtasks for root_task_2
        subtask_2_1 = Node(
            title="Setup OAuth2 Provider",
            content="Configure OAuth2 with Google and GitHub providers.",
            mode="task",
            status="todo",
            priority=2,
            due_date=datetime.now(timezone.utc) + timedelta(days=10),
            parent_id=root_task_2.id
        )

        subtask_2_2 = Node(
            title="Implement JWT Tokens",
            content="Add JWT token generation and validation. Follow [[Security Best Practices]].",
            mode="task",
            status="todo",
            priority=2,
            due_date=datetime.now(timezone.utc) + timedelta(days=12),
            parent_id=root_task_2.id
        )

        # Create subtasks for root_task_3
        subtask_3_1 = Node(
            title="Add Redis Caching",
            content="Implement Redis for caching frequently accessed data.",
            mode="task",
            status="todo",
            priority=3,
            due_date=datetime.now(timezone.utc) + timedelta(days=18),
            parent_id=root_task_3.id
        )

        db.add_all([
            subtask_1_1, subtask_1_2, subtask_1_3,
            subtask_2_1, subtask_2_2, subtask_3_1
        ])
        db.commit()

        # Create notes
        note_1 = Node(
            title="Graph Database Comparison",
            content="""# Graph Database Comparison

## Neo4j
- Pros: Mature, great tooling, Cypher query language
- Cons: Enterprise features are paid
- Best for: Complex relationship queries

## ArangoDB
- Pros: Multi-model (graph, document, key-value)
- Cons: Smaller community
- Best for: Flexible data models

See related tasks: [[Build GraphDB Integration]]

References:
- [[Database Architecture Notes]]
- [[Performance Benchmarks]]
""",
            mode="note",
            parent_id=None
        )

        note_2 = Node(
            title="Security Best Practices",
            content="""# Security Best Practices

## Authentication
- Always use HTTPS
- Implement rate limiting
- Use secure token storage

## OAuth2
- Validate redirect URIs
- Use PKCE for mobile apps
- Store secrets securely

Related: [[Implement User Authentication]]
""",
            mode="note",
            parent_id=None
        )

        note_3 = Node(
            title="Database Architecture Notes",
            content="""# Database Architecture

## Current Design
- PostgreSQL for relational data
- Redis for caching
- Considering graph DB for relationships

## Future Improvements
- [[Graph Database Comparison]] shows potential benefits
- Need to evaluate migration strategy

See [[Performance Benchmarks]] for current metrics.
""",
            mode="note",
            parent_id=None
        )

        note_4 = Node(
            title="Performance Benchmarks",
            content="""# Performance Benchmarks

## Current Metrics
- Query latency: 150ms avg
- Cache hit rate: 75%
- DB connection pool: 20

## Goals
- Reduce latency to <100ms
- Increase cache hit rate to 90%

Related task: [[Performance Optimization]]
""",
            mode="note",
            parent_id=None
        )

        note_5 = Node(
            title="Project Roadmap",
            content="""# Project Roadmap Q1 2025

## High Priority
- [[Build GraphDB Integration]]
- [[Implement User Authentication]]

## Medium Priority
- [[Performance Optimization]]

## Nice to Have
- Mobile app development
- Advanced analytics dashboard
""",
            mode="note",
            parent_id=None
        )

        db.add_all([note_1, note_2, note_3, note_4, note_5])
        db.commit()

        # Sync wiki links from all nodes
        all_nodes = [
            root_task_1, root_task_2, root_task_3,
            subtask_1_1, subtask_1_2, subtask_1_3,
            subtask_2_1, subtask_2_2, subtask_3_1,
            note_1, note_2, note_3, note_4, note_5
        ]

        for node in all_nodes:
            sync_wiki_links(db, node)

        # Create dependency links
        # subtask_1_1 and subtask_1_2 must be done before subtask_1_3
        dep1 = NodeLink(
            source_id=subtask_1_3.id,  # Dependent task
            target_id=subtask_1_1.id,  # Preceding task
            link_type="dependency"
        )

        dep2 = NodeLink(
            source_id=subtask_1_3.id,  # Dependent task
            target_id=subtask_1_2.id,  # Preceding task
            link_type="dependency"
        )

        # subtask_2_1 must be done before subtask_2_2
        dep3 = NodeLink(
            source_id=subtask_2_2.id,  # Dependent task
            target_id=subtask_2_1.id,  # Preceding task
            link_type="dependency"
        )

        # root_task_1 must be done before root_task_3
        dep4 = NodeLink(
            source_id=root_task_3.id,  # Dependent task
            target_id=root_task_1.id,  # Preceding task
            link_type="dependency"
        )

        db.add_all([dep1, dep2, dep3, dep4])
        db.commit()

        print("✅ Test data added successfully!")
        print(f"   - {len([n for n in all_nodes if n.mode == 'task'])} tasks created")
        print(f"   - {len([n for n in all_nodes if n.mode == 'note'])} notes created")
        print(f"   - {db.query(NodeLink).filter(NodeLink.link_type == 'dependency').count()} dependencies created")
        print(f"   - {db.query(NodeLink).filter(NodeLink.link_type == 'reference').count()} wiki links created")

    except Exception as e:
        db.rollback()
        print(f"❌ Error adding test data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    add_test_data()
