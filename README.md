# TaskNotes

A personal task management and note-taking app combining Workflowy's infinite subtasks with Obsidian-style markdown and linking.

## Features

- **Infinite nested subtasks** - Create unlimited depth task hierarchies
- **Unified nodes** - Tasks and notes share the same structure, switchable with one click
- **Markdown-first** - All content stored as readable `.md` files with YAML frontmatter
- **Smart priorities** - Automatic priority calculation based on due dates, urgency, and task depth
- **Due date propagation** - Parent tasks inherit earliest child due dates; children inherit parent constraints
- **Full-text search** - Search across all titles and content
- **Filters & views** - Filter by mode (task/note), status, priority

## Quick Start

```bash
# Navigate to project
cd tasknotes

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the app
python run.py
```

Then open http://localhost:8000 in your browser.

## Project Structure

```
tasknotes/
├── backend/
│   ├── main.py              # FastAPI app entry
│   ├── database.py          # SQLite configuration
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── routers/
│   │   └── nodes.py         # API endpoints
│   └── services/
│       ├── node_service.py    # CRUD operations
│       ├── sync_service.py    # Markdown <-> DB sync
│       └── priority_service.py # Priority propagation
├── frontend/
│   ├── static/
│   │   ├── css/main.css
│   │   └── js/app.js
│   └── templates/
│       └── index.html
├── data/
│   ├── nodes/              # Your markdown files (source of truth)
│   ├── attachments/        # File attachments
│   └── tasknotes.db        # SQLite index (auto-generated)
├── requirements.txt
└── run.py
```

## Data Model

Each node is stored as a markdown file:

```markdown
---
id: abc123
title: My Task
mode: task
status: todo
priority: 2
parent_id: parent-uuid
due_date: 2024-02-15T10:00:00
---

Your markdown content here. Can include:
- Lists
- **formatting**
- Links
- Code blocks
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nodes/` | List nodes with filters |
| GET | `/api/nodes/tree` | Get full tree structure |
| GET | `/api/nodes/search?q=query` | Full-text search |
| POST | `/api/nodes/` | Create node |
| PATCH | `/api/nodes/{id}` | Update node |
| DELETE | `/api/nodes/{id}` | Delete node (and children) |
| POST | `/api/nodes/{id}/move` | Move node to new parent |
| POST | `/api/nodes/links` | Create link between nodes |
| GET | `/api/sync` | Manually sync from markdown files |

## Keyboard Shortcuts

- `Enter` in quick-add → Create new task
- `Escape` → Close modal
- Click `+` on any task → Add subtask

## Future Improvements

- [ ] DAG graph visualization (Cytoscape.js)
- [ ] Kanban board view
- [ ] Calendar/timeline view
- [ ] Drag-and-drop reordering
- [ ] PDF embedding
- [ ] Cross-node linking UI
- [ ] File attachments UI
- [ ] Export/import

## License

Personal use. Built with FastAPI, SQLite, and vanilla JS.
