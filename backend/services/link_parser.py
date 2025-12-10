"""Service for parsing and managing wiki-style [[links]] in content."""
import re
from typing import List, Set, Tuple
from sqlalchemy.orm import Session

from ..models import Node, NodeLink


def extract_wiki_links(content: str) -> Set[str]:
    """
    Extract all [[wiki-style]] links from content.
    Returns set of page titles referenced.
    """
    pattern = r'\[\[([^\]]+)\]\]'
    matches = re.findall(pattern, content)
    return set(matches)


def find_or_create_node_by_title(db: Session, title: str, mode: str = "note") -> Node:
    """
    Find a node by title (case-insensitive) or create it if it doesn't exist.
    """
    # Try to find existing node
    node = db.query(Node).filter(
        Node.title.ilike(title)
    ).first()

    if not node:
        # Create new node
        node = Node(
            title=title,
            mode=mode,
            content=""
        )
        db.add(node)
        db.flush()  # Get ID without committing

    return node


def sync_wiki_links(db: Session, source_node: Node) -> Tuple[int, int]:
    """
    Parse wiki links from node content and create/update NodeLinks.
    Returns (created_count, deleted_count).
    """
    # Extract current links from content
    content = source_node.content or ""
    wiki_titles = extract_wiki_links(content)

    # Get existing wiki links for this node
    existing_links = db.query(NodeLink).filter(
        NodeLink.source_id == source_node.id,
        NodeLink.link_type == "wiki"
    ).all()

    existing_targets = {link.target_id: link for link in existing_links}

    # Find target nodes
    current_targets = set()
    for title in wiki_titles:
        target_node = find_or_create_node_by_title(db, title)
        current_targets.add(target_node.id)

        # Create link if doesn't exist
        if target_node.id not in existing_targets:
            link = NodeLink(
                source_id=source_node.id,
                target_id=target_node.id,
                link_type="wiki"
            )
            db.add(link)

    # Delete links that no longer exist in content
    deleted_count = 0
    for target_id, link in existing_targets.items():
        if target_id not in current_targets:
            db.delete(link)
            deleted_count += 1

    created_count = len(current_targets) - len(existing_targets)

    return (created_count, deleted_count)


def get_backlinks(db: Session, node_id: str) -> List[Node]:
    """
    Get all nodes that link to this node via wiki links.
    """
    links = db.query(NodeLink).filter(
        NodeLink.target_id == node_id,
        NodeLink.link_type == "wiki"
    ).all()

    source_ids = [link.source_id for link in links]
    if not source_ids:
        return []

    return db.query(Node).filter(Node.id.in_(source_ids)).all()


def render_wiki_links_as_html(content: str) -> str:
    """
    Convert [[wiki links]] to clickable HTML anchors.
    For frontend rendering.
    """
    def replace_link(match):
        title = match.group(1)
        # Return HTML link with data attribute for navigation
        return f'<a href="#" class="wiki-link" data-page="{title}">[[{title}]]</a>'

    pattern = r'\[\[([^\]]+)\]\]'
    return re.sub(pattern, replace_link, content)
