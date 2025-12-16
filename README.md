# TaskNotes

A personal task management and note-taking app combining Workflowy's infinite subtasks with Obsidian-style markdown and linking. Built for one user, tuned for fast keyboard-driven workflows.

## Features

- **Infinite nested subtasks** - Create unlimited depth task hierarchies
- **Unified nodes** - Tasks and notes share the same structure, switchable with one click
- **Markdown-first** - All content stored as readable `.md` files with YAML frontmatter
- **Smart priorities** - Automatic priority calculation using due dates, priority, blockers/children, and quick-task bonuses (done tasks don’t propagate)
- **Chores** - Priority 5 tasks auto-roll to today 23:59 in the selected timezone
- **Timezone-aware** - User-selectable timezone for due/rollover display and scoring
- **Due date propagation** - Parent tasks inherit earliest child due dates; dependencies propagate constraints
- **Full-text search** - Search across all titles and content
- **Filters & views** - Filter by mode/status/priority/tags, tree view sorted by date, graph view, and a priority view showing tasks due in the next 2 weeks (P1–P4 vs chores)
- **Notes grouping** - Notes are grouped under a collapsible “Notes” root in the tree, tasks sorted by date at each level
- **Archiving & sync** - Markdown files normalized with IDs; deletes archive the file; missing files remove DB rows; watcher debounced to avoid sync spam

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
│   ├── nodes/              # Your markdown files (source of truth, ignored in git)
│   ├── attachments/        # File attachments
│   ├── archived/           # Archived/deleted markdown files
│   └── tasknotes.db        # SQLite index (auto-generated)
├── example nodes/          # Sample markdown nodes you can import
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
priority: 3          # 1-5 (5 = chore)
tags: [research, ai] # optional
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
| GET | `/api/nodes/{id}/dependencies` | Dependencies for a node |
| POST | `/api/nodes/` | Create node |
| PATCH | `/api/nodes/{id}` | Update node |
| DELETE | `/api/nodes/{id}` | Delete node (and children) |
| POST | `/api/nodes/{id}/move` | Move node to new parent |
| POST | `/api/nodes/links` | Create link between nodes |
| GET | `/api/nodes/tree` | Tree data for UI |
| POST | `/api/timezone` | Set timezone offset (minutes) |

## Keyboard Shortcuts

- `Enter` in quick-add → Create new task
- `Escape` → Close modal
- Click `+` on any task → Add subtask
- `Cmd/Ctrl + K` → Command palette for editing

## License

Personal use. Built with FastAPI, SQLite, and vanilla JS.
