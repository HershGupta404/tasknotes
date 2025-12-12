/**
 * TaskNotes - Frontend Application
 */

const API_BASE = '/api/nodes';

// State
const state = {
    nodes: [],
    selectedNode: null,
    expandedNodes: new Set(),
    filters: {
        mode: null,
        status: null
    },
    searchQuery: '',
    currentView: 'tree', // 'tree' or 'page'
    openTabs: [],  // Array of {id, title, node}
    activeTab: null,
    commandPalette: {
        isOpen: false,
        element: null,
        selectedIndex: 0,
        commands: []
    }
};

// API Functions
async function fetchTree() {
    const res = await fetch(`${API_BASE}/tree`);
    return res.json();
}

async function fetchNode(id) {
    const res = await fetch(`${API_BASE}/${id}`);
    return res.json();
}

async function fetchBacklinks(id) {
    const res = await fetch(`${API_BASE}/${id}/backlinks`);
    return res.json();
}

async function findNodeByTitle(title) {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(title)}`);
    const results = await res.json();
    return results.find(n => n.title.toLowerCase() === title.toLowerCase());
}

async function createNode(data) {
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

async function updateNode(id, data) {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return res.json();
}

async function deleteNode(id) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
}

async function searchNodes(query) {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    return res.json();
}

async function autocompleteNodes(query) {
    const res = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(query)}`);
    return res.json();
}

async function fetchDependencies(id) {
    const res = await fetch(`${API_BASE}/${id}/dependencies`);
    return res.json();
}

async function createDependencyLink(sourceId, targetId) {
    const res = await fetch(`${API_BASE}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            source_id: sourceId,
            target_id: targetId,
            link_type: 'dependency'
        })
    });
    return res.json();
}

// Render Functions
function renderTree(nodes, container) {
    container.innerHTML = '';
    
    if (nodes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No tasks yet</h3>
                <p>Create your first task to get started</p>
            </div>
        `;
        return;
    }
    
    nodes.forEach(node => {
        const nodeEl = renderNode(node);
        container.appendChild(nodeEl);
    });
}

function renderNode(node, depth = 0) {
    const div = document.createElement('div');
    div.className = 'tree-node';
    div.dataset.id = node.id;
    
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = state.expandedNodes.has(node.id);
    const isSelected = state.selectedNode?.id === node.id;
    
    // Check if matches filters
    if (!matchesFilters(node)) {
        div.style.display = 'none';
        return div;
    }
    
    div.innerHTML = `
        <div class="node-item ${isSelected ? 'selected' : ''}" data-id="${node.id}">
            <span class="node-toggle ${hasChildren ? 'has-children' : ''}" data-id="${node.id}">
                ${hasChildren ? (isExpanded ? '▼' : '▶') : ''}
            </span>
            ${node.mode === 'task' ? `
                <div class="node-checkbox ${node.status === 'done' ? 'checked' : ''} ${node.status === 'in_progress' ? 'in-progress' : ''}" 
                     data-id="${node.id}" data-status="${node.status}">
                    ${node.status === 'done' ? '✓' : ''}
                </div>
            ` : ''}
            <span class="priority-dot priority-${node.priority}"></span>
            <div class="node-content">
                <div class="node-title ${node.status === 'done' ? 'done' : ''}">${escapeHtml(node.title)}</div>
                <div class="node-meta">
                    ${node.mode === 'note' ? '<span class="node-badge badge-note">Note</span>' : ''}
                    ${node.due_date ? renderDueBadge(node.due_date) : ''}
                    ${hasChildren ? `<span>${node.children.length} subtask${node.children.length > 1 ? 's' : ''}</span>` : ''}
                </div>
            </div>
            ${node.mode === 'task' ? `<button class="btn-icon add-subtask" data-id="${node.id}" title="Add subtask">+</button>` : ''}
        </div>
    `;
    
    // Render children if expanded
    if (hasChildren && isExpanded) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';
        node.children.forEach(child => {
            childContainer.appendChild(renderNode(child, depth + 1));
        });
        div.appendChild(childContainer);
    }
    
    return div;
}

function renderDueBadge(dueDateStr) {
    const due = new Date(dueDateStr);
    const now = new Date();
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    
    let label = due.toLocaleDateString();
    let className = 'badge-due';
    
    if (diffDays < 0) {
        label = `Overdue (${Math.abs(diffDays)}d)`;
        className = 'badge-overdue';
    } else if (diffDays === 0) {
        label = 'Due today';
    } else if (diffDays === 1) {
        label = 'Due tomorrow';
    } else if (diffDays <= 7) {
        label = `Due in ${diffDays}d`;
    }
    
    return `<span class="node-badge ${className}">${label}</span>`;
}

async function renderDetailPanel(node) {
    const panel = document.getElementById('detail-panel');

    if (!node) {
        panel.innerHTML = `
            <div class="empty-state">
                <p>Select a task or note to view details</p>
            </div>
        `;
        return;
    }

    // Fetch all metadata
    const backlinks = await fetchBacklinks(node.id);
    const dependencies = node.mode === 'task' ? await fetchDependencies(node.id) : null;
    const parentNode = node.parent_id ? await fetchNode(node.parent_id) : null;
    const subtasks = node.children && node.children.length > 0 ? node.children : [];

    // Render wiki links in content preview
    const contentPreview = renderWikiLinks(node.content || 'No content');

    panel.innerHTML = `
        <div class="detail-header">
            <div class="mode-toggle">
                <button class="${node.mode === 'task' ? 'active' : ''}" data-mode="task">Task</button>
                <button class="${node.mode === 'note' ? 'active' : ''}" data-mode="note">Note</button>
            </div>
        </div>

        ${parentNode ? `
        <div class="detail-section" style="background: var(--bg-primary); padding: 12px; border-radius: 6px;">
            <h3 style="margin-bottom: 8px;">📍 Parent Task</h3>
            <div class="parent-task-info" data-node-id="${parentNode.id}" style="cursor: pointer; padding: 8px; background: var(--bg-secondary); border-radius: 4px;">
                <div style="font-weight: 500;">${escapeHtml(parentNode.title)}</div>
                <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.85rem;">
                    <span class="node-badge badge-${parentNode.status}">${parentNode.status}</span>
                    <span style="color: var(--text-secondary);">Priority: ${parentNode.priority}</span>
                    ${parentNode.due_date ? renderDueBadge(parentNode.due_date) : ''}
                </div>
            </div>
        </div>
        ` : ''}

        <div class="detail-section">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="detail-title" value="${escapeHtml(node.title)}">
            </div>

            ${node.mode === 'task' ? `
                <div class="form-row">
                    <div class="form-group">
                        <label>Status</label>
                        <select id="detail-status" class="status-${node.status}">
                            <option value="todo" ${node.status === 'todo' ? 'selected' : ''}>To Do</option>
                            <option value="in_progress" ${node.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                            <option value="done" ${node.status === 'done' ? 'selected' : ''}>Done</option>
                            <option value="cancelled" ${node.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Priority</label>
                        <select id="detail-priority">
                            <option value="1" ${node.priority === 1 ? 'selected' : ''}>🔴 Urgent</option>
                            <option value="2" ${node.priority === 2 ? 'selected' : ''}>🟠 High</option>
                            <option value="3" ${node.priority === 3 ? 'selected' : ''}>🟡 Medium</option>
                            <option value="4" ${node.priority === 4 ? 'selected' : ''}>🟢 Low</option>
                            <option value="5" ${node.priority === 5 ? 'selected' : ''}>⚪ Someday</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Due Date</label>
                    <input type="datetime-local" id="detail-due" value="${node.due_date ? formatDateForInput(node.due_date) : ''}">
                </div>
            ` : ''}
        </div>

        ${subtasks.length > 0 ? `
        <div class="detail-section">
            <h3>📋 Subtasks (${subtasks.length})</h3>
            <div class="subtasks-list">
                ${subtasks.map(subtask => `
                    <div class="subtask-item" data-node-id="${subtask.id}" style="padding: 10px; background: var(--bg-primary); border-radius: 6px; margin-bottom: 8px; cursor: pointer;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="node-checkbox ${subtask.status === 'done' ? 'checked' : ''}" style="flex-shrink: 0;">
                                ${subtask.status === 'done' ? '✓' : ''}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-weight: 500; ${subtask.status === 'done' ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${escapeHtml(subtask.title)}</div>
                                <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.85rem;">
                                    <span class="node-badge badge-${subtask.status}">${subtask.status}</span>
                                    <span style="color: var(--text-secondary);">P${subtask.priority}</span>
                                    ${subtask.due_date ? renderDueBadge(subtask.due_date) : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-ghost btn-sm" style="width: 100%; margin-top: 8px;" onclick="showCreateModal('task', '${node.id}')">+ Add Subtask</button>
        </div>
        ` : (node.mode === 'task' ? `
        <div class="detail-section">
            <button class="btn btn-ghost btn-sm" style="width: 100%;" onclick="showCreateModal('task', '${node.id}')">+ Add Subtask</button>
        </div>
        ` : '')}

        ${dependencies && (dependencies.blocking.length > 0 || dependencies.blocked_by.length > 0) ? `
        <div class="detail-section">
            <h3>🔗 Dependencies</h3>
            ${dependencies.blocking.length > 0 ? `
            <div style="margin-bottom: 12px;">
                <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px;">Blocked By (must complete first):</h4>
                <div class="dependencies-list">
                    ${dependencies.blocking.map(dep => `
                        <div class="dependency-item" data-node-id="${dep.id}" style="padding: 8px; background: var(--bg-primary); border-radius: 4px; margin-bottom: 4px; cursor: pointer; border-left: 3px solid var(--warning);">
                            <div style="font-weight: 500;">${escapeHtml(dep.title)}</div>
                            <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.85rem;">
                                <span class="node-badge badge-${dep.status}">${dep.status}</span>
                                <span style="color: var(--text-secondary);">P${dep.priority}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            ${dependencies.blocked_by.length > 0 ? `
            <div>
                <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px;">Blocking (waiting for this):</h4>
                <div class="dependencies-list">
                    ${dependencies.blocked_by.map(dep => `
                        <div class="dependency-item" data-node-id="${dep.id}" style="padding: 8px; background: var(--bg-primary); border-radius: 4px; margin-bottom: 4px; cursor: pointer; border-left: 3px solid var(--accent);">
                            <div style="font-weight: 500;">${escapeHtml(dep.title)}</div>
                            <div style="display: flex; gap: 8px; margin-top: 4px; font-size: 0.85rem;">
                                <span class="node-badge badge-${dep.status}">${dep.status}</span>
                                <span style="color: var(--text-secondary);">P${dep.priority}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            <button class="btn btn-ghost btn-sm" style="width: 100%; margin-top: 8px;" id="add-dependency-btn">+ Add Dependency</button>
        </div>
        ` : (node.mode === 'task' ? `
        <div class="detail-section">
            <h3>🔗 Dependencies</h3>
            <button class="btn btn-ghost btn-sm" style="width: 100%;" id="add-dependency-btn">+ Add Dependency</button>
        </div>
        ` : '')}

        <div class="detail-section">
            <h3>Content (Markdown)</h3>
            <textarea id="detail-content" placeholder="Add notes, details, or markdown content... Use [[Page Name]] to link to other notes">${escapeHtml(node.content || '')}</textarea>
            <div style="margin-top: 8px; padding: 8px; background: var(--bg-primary); border-radius: 6px;">
                <small style="color: var(--text-secondary);">Preview:</small>
                <div class="content-renderer">${contentPreview}</div>
            </div>
        </div>

        ${backlinks.length > 0 ? `
        <div class="detail-section">
            <h3>Backlinks (${backlinks.length})</h3>
            <div class="backlinks-section">
                <ul class="backlinks-list">
                    ${backlinks.map(bl => `
                        <li data-node-id="${bl.id}">
                            ${escapeHtml(bl.title)}
                            <small style="color: var(--text-secondary); display: block; margin-top: 2px;">
                                ${bl.mode === 'task' ? '📋 Task' : '📝 Note'}
                            </small>
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
        ` : ''}

        <div class="detail-section">
            <h3>Info</h3>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                <p>Created: ${new Date(node.created_at).toLocaleString()}</p>
                <p>Updated: ${new Date(node.updated_at).toLocaleString()}</p>
                <p>Priority Score: ${node.computed_priority?.toFixed(1) || 'N/A'}</p>
            </div>
        </div>

        <div class="modal-actions">
            <button class="btn btn-ghost" id="delete-node-btn">Delete</button>
            <button class="btn btn-primary" id="save-node-btn">Save</button>
        </div>
    `;

    // Add event listeners
    setupDetailPanelListeners(node);

    // Add backlink click handlers
    document.querySelectorAll('.backlinks-list li').forEach(item => {
        item.addEventListener('click', async () => {
            const nodeId = item.dataset.nodeId;
            state.selectedNode = await fetchNode(nodeId);
            refreshTree();
            await renderDetailPanel(state.selectedNode);
        });
    });

    // Add wiki link click handlers
    document.querySelectorAll('.wiki-link').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const title = link.dataset.page;
            const targetNode = await findNodeByTitle(title);
            if (targetNode) {
                state.selectedNode = await fetchNode(targetNode.id);
                refreshTree();
                await renderDetailPanel(state.selectedNode);
            }
        });
    });

    // Parent task click handler
    document.querySelector('.parent-task-info')?.addEventListener('click', async () => {
        const parentId = document.querySelector('.parent-task-info').dataset.nodeId;
        state.selectedNode = await fetchNode(parentId);
        refreshTree();
        await renderDetailPanel(state.selectedNode);
    });

    // Subtask click handlers
    document.querySelectorAll('.subtask-item').forEach(item => {
        item.addEventListener('click', async () => {
            const subtaskId = item.dataset.nodeId;
            state.selectedNode = await fetchNode(subtaskId);
            refreshTree();
            await renderDetailPanel(state.selectedNode);
        });
    });

    // Dependency click handlers
    document.querySelectorAll('.dependency-item').forEach(item => {
        item.addEventListener('click', async () => {
            const depId = item.dataset.nodeId;
            state.selectedNode = await fetchNode(depId);
            refreshTree();
            await renderDetailPanel(state.selectedNode);
        });
    });

    // Add dependency button
    document.getElementById('add-dependency-btn')?.addEventListener('click', async () => {
        const targetTitle = prompt('Enter the title of the task that blocks this task:');
        if (targetTitle) {
            const targetNode = await findNodeByTitle(targetTitle);
            if (targetNode) {
                await createDependencyLink(node.id, targetNode.id);
                await renderDetailPanel(node);
            } else {
                alert('Task not found. Please enter an exact title.');
            }
        }
    });
}

function setupDetailPanelListeners(node) {
    // Mode toggle
    document.querySelectorAll('.mode-toggle button').forEach(btn => {
        btn.addEventListener('click', async () => {
            await updateNode(node.id, { mode: btn.dataset.mode });
            await refreshAll();
        });
    });

    // Save button
    document.getElementById('save-node-btn')?.addEventListener('click', async () => {
        const updates = {
            title: document.getElementById('detail-title').value,
            content: document.getElementById('detail-content').value
        };

        if (node.mode === 'task') {
            updates.status = document.getElementById('detail-status').value;
            updates.priority = parseInt(document.getElementById('detail-priority').value);
            const dueValue = document.getElementById('detail-due').value;
            updates.due_date = dueValue ? new Date(dueValue).toISOString() : null;
        }

        await updateNode(node.id, updates);
        await refreshAll();
    });

    // Delete button
    document.getElementById('delete-node-btn')?.addEventListener('click', async () => {
        if (confirm('Delete this item and all its children?')) {
            await deleteNode(node.id);
            state.selectedNode = null;
            await refreshAll();
        }
    });

    // Command palette trigger on detail-content textarea
    const contentTextarea = document.getElementById('detail-content');
    if (contentTextarea) {
        contentTextarea.addEventListener('keydown', (e) => {
            if (e.key === '/' && contentTextarea.selectionStart === contentTextarea.value.length) {
                // Only trigger if cursor is at the end or on a new line
                const beforeCursor = contentTextarea.value.substring(0, contentTextarea.selectionStart);
                const lastChar = beforeCursor[beforeCursor.length - 1];

                if (!lastChar || lastChar === '\n' || lastChar === ' ') {
                    e.preventDefault();
                    showCommandPalette(contentTextarea);
                }
            }

            // Command palette navigation
            if (state.commandPalette.isOpen) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    navigateCommandPalette('down');
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    navigateCommandPalette('up');
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    executeCommand();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    hideCommandPalette();
                }
            }
        });
    }
}

// Filter functions
function matchesFilters(node) {
    if (state.filters.mode && node.mode !== state.filters.mode) return false;
    if (state.filters.status && node.status !== state.filters.status) return false;
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        if (!node.title.toLowerCase().includes(query) && 
            !(node.content || '').toLowerCase().includes(query)) {
            return false;
        }
    }
    return true;
}

function setFilter(type, value) {
    state.filters[type] = state.filters[type] === value ? null : value;
    refreshTree();
    updateFilterUI();
}

function updateFilterUI() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const filterType = chip.dataset.filterType;
        const filterValue = chip.dataset.filterValue;
        chip.classList.toggle('active', state.filters[filterType] === filterValue);
    });
}

// Page View Functions
function switchView(viewName) {
    state.currentView = viewName;

    // Update view buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Toggle view containers
    document.getElementById('tree-view').style.display = viewName === 'tree' ? 'block' : 'none';
    document.getElementById('page-view').style.display = viewName === 'page' ? 'block' : 'none';
    document.getElementById('graph-view').style.display = viewName === 'graph' ? 'block' : 'none';

    // Load graph if switching to graph view
    if (viewName === 'graph') {
        loadGraph();
    }
}

function openInPageView(node) {
    // Check if tab already exists
    const existingTab = state.openTabs.find(tab => tab.id === node.id);
    if (existingTab) {
        state.activeTab = existingTab.id;
        renderPageView();
        return;
    }

    // Add new tab
    state.openTabs.push({
        id: node.id,
        title: node.title,
        node: node
    });
    state.activeTab = node.id;

    // Switch to page view
    switchView('page');
    renderPageView();
}

function closeTab(tabId) {
    const index = state.openTabs.findIndex(tab => tab.id === tabId);
    if (index === -1) return;

    state.openTabs.splice(index, 1);

    // If closed active tab, switch to another or none
    if (state.activeTab === tabId) {
        state.activeTab = state.openTabs.length > 0 ? state.openTabs[0].id : null;
    }

    renderPageView();
}

async function renderPageView() {
    const tabsList = document.getElementById('tabs-list');
    const pageContent = document.getElementById('page-content');

    // Render tabs
    tabsList.innerHTML = state.openTabs.map(tab => `
        <div class="page-tab ${tab.id === state.activeTab ? 'active' : ''}" data-tab-id="${tab.id}">
            <span>${escapeHtml(tab.title)}</span>
            <button class="page-tab-close" onclick="event.stopPropagation(); closeTab('${tab.id}')">×</button>
        </div>
    `).join('');

    // Add tab click handlers
    document.querySelectorAll('.page-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.activeTab = tab.dataset.tabId;
            renderPageView();
        });
    });

    // Render active page content
    if (state.activeTab) {
        const tab = state.openTabs.find(t => t.id === state.activeTab);
        if (tab) {
            // Fetch latest node data
            const node = await fetchNode(tab.id);
            tab.node = node;

            const backlinks = await fetchBacklinks(node.id);
            const contentPreview = renderWikiLinks(node.content || '');

            pageContent.innerHTML = `
                <div class="page-editor">
                    <input type="text" class="page-title-input" id="page-title" value="${escapeHtml(node.title)}" placeholder="Page title...">

                    <div class="page-metadata">
                        <div class="page-metadata-item">
                            <span>📝</span>
                            <select id="page-mode" class="btn-ghost" style="padding: 4px 8px;">
                                <option value="note" ${node.mode === 'note' ? 'selected' : ''}>Note</option>
                                <option value="task" ${node.mode === 'task' ? 'selected' : ''}>Task</option>
                            </select>
                        </div>
                        ${node.mode === 'task' ? `
                        <div class="page-metadata-item">
                            <span>📊</span>
                            <select id="page-status" style="padding: 4px 8px;">
                                <option value="todo" ${node.status === 'todo' ? 'selected' : ''}>To Do</option>
                                <option value="in_progress" ${node.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="done" ${node.status === 'done' ? 'selected' : ''}>Done</option>
                            </select>
                        </div>
                        <div class="page-metadata-item">
                            <span>🔥</span>
                            <select id="page-priority" style="padding: 4px 8px;">
                                <option value="1" ${node.priority === 1 ? 'selected' : ''}>Urgent</option>
                                <option value="2" ${node.priority === 2 ? 'selected' : ''}>High</option>
                                <option value="3" ${node.priority === 3 ? 'selected' : ''}>Medium</option>
                                <option value="4" ${node.priority === 4 ? 'selected' : ''}>Low</option>
                                <option value="5" ${node.priority === 5 ? 'selected' : ''}>Someday</option>
                            </select>
                        </div>
                        ` : ''}
                        <div class="page-metadata-item">
                            <button class="btn btn-primary btn-sm" id="save-page-btn">💾 Save</button>
                        </div>
                    </div>

                    <textarea class="page-content-editor" id="page-content-text" placeholder="Start writing... Use [[Page Name]] to link to other pages">${escapeHtml(node.content || '')}</textarea>

                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px;">PREVIEW</h3>
                        <div class="content-renderer">${contentPreview}</div>
                    </div>

                    ${backlinks.length > 0 ? `
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
                        <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 12px;">BACKLINKS (${backlinks.length})</h3>
                        <div class="backlinks-section">
                            <ul class="backlinks-list">
                                ${backlinks.map(bl => `
                                    <li data-node-id="${bl.id}">
                                        ${escapeHtml(bl.title)}
                                        <small style="color: var(--text-secondary); display: block; margin-top: 2px;">
                                            ${bl.mode === 'task' ? '📋 Task' : '📝 Note'}
                                        </small>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;

            // Setup save handler
            document.getElementById('save-page-btn')?.addEventListener('click', async () => {
                const updates = {
                    title: document.getElementById('page-title').value,
                    content: document.getElementById('page-content-text').value,
                    mode: document.getElementById('page-mode').value
                };

                if (node.mode === 'task') {
                    updates.status = document.getElementById('page-status')?.value;
                    updates.priority = parseInt(document.getElementById('page-priority')?.value);
                }

                await updateNode(node.id, updates);
                tab.title = updates.title;
                await renderPageView();
                await refreshTree();
            });

            // Setup backlink handlers
            document.querySelectorAll('.backlinks-list li').forEach(item => {
                item.addEventListener('click', async () => {
                    const backNode = await fetchNode(item.dataset.nodeId);
                    openInPageView(backNode);
                });
            });

            // Setup wiki link handlers
            document.querySelectorAll('.wiki-link').forEach(link => {
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const title = link.dataset.page;
                    const targetNode = await findNodeByTitle(title);
                    if (targetNode) {
                        const fullNode = await fetchNode(targetNode.id);
                        openInPageView(fullNode);
                    }
                });
            });

            // Setup command palette for page content editor
            const pageContentTextarea = document.getElementById('page-content-text');
            if (pageContentTextarea) {
                pageContentTextarea.addEventListener('keydown', (e) => {
                    if (e.key === '/' && pageContentTextarea.selectionStart === pageContentTextarea.value.length) {
                        // Only trigger if cursor is at the end or on a new line
                        const beforeCursor = pageContentTextarea.value.substring(0, pageContentTextarea.selectionStart);
                        const lastChar = beforeCursor[beforeCursor.length - 1];

                        if (!lastChar || lastChar === '\n' || lastChar === ' ') {
                            e.preventDefault();
                            showCommandPalette(pageContentTextarea);
                        }
                    }

                    // Command palette navigation
                    if (state.commandPalette.isOpen) {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            navigateCommandPalette('down');
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            navigateCommandPalette('up');
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            executeCommand();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            hideCommandPalette();
                        }
                    }
                });
            }
        }
    } else {
        pageContent.innerHTML = `
            <div class="empty-state">
                <h3>No page open</h3>
                <p>Select a node from the tree or create a new page</p>
            </div>
        `;
    }
}

function openNewPage() {
    showCreateModal('note');
}

// Graph View Functions
async function loadGraph() {
    try {
        const response = await fetch('/api/nodes/graph');
        const data = await response.json();
        renderGraph(data);
    } catch (error) {
        console.error('Failed to load graph:', error);
    }
}

function renderGraph(graphData) {
    const container = document.getElementById('graph-container');
    container.innerHTML = ''; // Clear existing graph

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create SVG
    const svg = d3.select('#graph-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Add zoom behavior
    const g = svg.append('g');
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    svg.call(zoom);

    // Create force simulation
    const simulation = d3.forceSimulation(graphData.nodes)
        .force('link', d3.forceLink(graphData.edges)
            .id(d => d.id)
            .distance(d => {
                if (d.type === 'hierarchy') return 100;
                if (d.type === 'dependency') return 150;
                return 120;
            }))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(d => d.size + 10));

    // Add extra force to center root tasks
    const rootNodes = graphData.nodes.filter(n => n.is_root);
    if (rootNodes.length > 0) {
        simulation.force('root-center', d3.forceRadial(
            0,
            width / 2,
            height / 2
        ).strength(d => d.is_root ? 0.3 : 0));
    }

    // Create arrow markers for directed edges
    svg.append('defs').selectAll('marker')
        .data(['dependency'])
        .join('marker')
        .attr('id', d => `arrow-${d}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', '#fbbf24')
        .attr('d', 'M0,-5L10,0L0,5');

    // Draw links
    const link = g.append('g')
        .selectAll('line')
        .data(graphData.edges)
        .join('line')
        .attr('class', d => `graph-link ${d.type}`)
        .attr('marker-end', d => d.type === 'dependency' ? 'url(#arrow-dependency)' : null);

    // Draw bidirectional arrows for hierarchy
    const hierarchyArrows = g.append('g')
        .selectAll('path')
        .data(graphData.edges.filter(d => d.bidirectional))
        .join('path')
        .attr('fill', 'none')
        .attr('stroke', 'none');

    // Add arrow markers to both ends of hierarchical links
    svg.select('defs').append('marker')
        .attr('id', 'arrow-hierarchy-start')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 0)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', '#e94560')
        .attr('d', 'M10,-5L0,0L10,5');

    svg.select('defs').append('marker')
        .attr('id', 'arrow-hierarchy-end')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', '#e94560')
        .attr('d', 'M0,-5L10,0L0,5');

    // Update hierarchy links to have arrows on both ends
    link.filter(d => d.type === 'hierarchy')
        .attr('marker-start', 'url(#arrow-hierarchy-start)')
        .attr('marker-end', 'url(#arrow-hierarchy-end)');

    // Draw nodes
    const node = g.append('g')
        .selectAll('circle')
        .data(graphData.nodes)
        .join('circle')
        .attr('class', d => {
            if (d.mode === 'note') return 'graph-node note';
            return `graph-node task-priority-${d.priority}`;
        })
        .attr('r', d => d.size)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended))
        .on('click', (event, d) => {
            selectNode(d.id);
        });

    // Add labels
    const label = g.append('g')
        .selectAll('text')
        .data(graphData.nodes)
        .join('text')
        .attr('class', 'graph-label')
        .attr('dy', d => d.size + 15)
        .text(d => d.title.length > 20 ? d.title.substring(0, 20) + '...' : d.title);

    // Add tooltips
    node.append('title')
        .text(d => `${d.title}\n${d.mode === 'task' ? `Priority: ${d.priority}\nStatus: ${d.status}` : 'Note'}`);

    // Update positions on each tick
    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        label
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    });

    // Drag functions
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}

// Inline Command Palette Functions
function showCommandPalette(inputElement) {
    if (state.commandPalette.isOpen) return;

    const parentNode = state.selectedNode;

    // Define available commands
    state.commandPalette.commands = [
        {
            id: 'task',
            icon: '✓',
            title: 'Add Subtask',
            description: 'Create a new subtask inline',
            action: () => showInlineTaskInput(parentNode)
        },
        {
            id: 'note',
            icon: '📝',
            title: 'Add Note',
            description: 'Create a new note',
            action: () => showCreateModal('note', parentNode?.id)
        }
    ];

    // Only show subtask option if we have a selected task
    if (!parentNode || parentNode.mode !== 'task') {
        state.commandPalette.commands = state.commandPalette.commands.filter(c => c.id !== 'task');
    }

    // Create palette element
    const palette = document.createElement('div');
    palette.className = 'inline-command-palette';
    palette.id = 'command-palette';

    // Position near cursor/input
    const rect = inputElement.getBoundingClientRect();
    palette.style.left = `${rect.left}px`;
    palette.style.top = `${rect.bottom + 5}px`;

    palette.innerHTML = `
        <div class="command-palette-list">
            ${state.commandPalette.commands.map((cmd, index) => `
                <div class="command-palette-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
                    <span class="command-palette-item-icon">${cmd.icon}</span>
                    <div class="command-palette-item-content">
                        <div class="command-palette-item-title">${cmd.title}</div>
                        <div class="command-palette-item-description">${cmd.description}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    document.body.appendChild(palette);
    state.commandPalette.isOpen = true;
    state.commandPalette.element = palette;
    state.commandPalette.selectedIndex = 0;

    // Add click handlers
    palette.querySelectorAll('.command-palette-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            executeCommand(index);
        });
        item.addEventListener('mouseenter', () => {
            selectCommandItem(index);
        });
    });
}

function hideCommandPalette() {
    if (state.commandPalette.element) {
        state.commandPalette.element.remove();
        state.commandPalette.element = null;
        state.commandPalette.isOpen = false;
        state.commandPalette.selectedIndex = 0;
    }
}

function selectCommandItem(index) {
    const items = state.commandPalette.element?.querySelectorAll('.command-palette-item');
    if (!items) return;

    items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
    });
    state.commandPalette.selectedIndex = index;
}

function executeCommand(index = state.commandPalette.selectedIndex) {
    const command = state.commandPalette.commands[index];
    if (command) {
        hideCommandPalette();
        command.action();
    }
}

function navigateCommandPalette(direction) {
    const newIndex = direction === 'down'
        ? Math.min(state.commandPalette.selectedIndex + 1, state.commandPalette.commands.length - 1)
        : Math.max(state.commandPalette.selectedIndex - 1, 0);
    selectCommandItem(newIndex);
}

function showInlineTaskInput(parentNode) {
    if (!parentNode) return;

    const detailPanel = document.getElementById('detail-panel');
    const subtasksSection = detailPanel.querySelector('.detail-section h3')?.parentElement;

    if (!subtasksSection) {
        // Create a section for subtasks if it doesn't exist
        const section = document.createElement('div');
        section.className = 'detail-section';
        section.innerHTML = '<h3>📋 Subtasks</h3><div class="subtasks-list"></div>';

        // Insert before content section
        const contentSection = Array.from(detailPanel.querySelectorAll('.detail-section'))
            .find(s => s.querySelector('h3')?.textContent.includes('Content'));
        if (contentSection) {
            detailPanel.insertBefore(section, contentSection);
        }
    }

    // Find or create subtasks list container
    let subtasksList = detailPanel.querySelector('.subtasks-list');
    if (!subtasksList) {
        subtasksList = document.createElement('div');
        subtasksList.className = 'subtasks-list';
        const h3 = Array.from(detailPanel.querySelectorAll('h3'))
            .find(h => h.textContent.includes('Subtasks'));
        if (h3) {
            h3.parentElement.appendChild(subtasksList);
        }
    }

    // Create inline input
    const inlineInput = document.createElement('div');
    inlineInput.className = 'inline-task-input';
    inlineInput.id = 'inline-task-input';
    inlineInput.innerHTML = `
        <input type="text" placeholder="Type subtask title... (press Enter to save, Esc to cancel)" id="inline-task-title" autofocus>
        <div class="inline-task-meta">
            <select id="inline-task-priority">
                <option value="3">🟡 P3</option>
                <option value="1">🔴 P1</option>
                <option value="2">🟠 P2</option>
                <option value="4">🟢 P4</option>
                <option value="5">⚪ P5</option>
            </select>
            <button class="btn btn-primary btn-sm" id="inline-task-save">✓</button>
            <button class="btn btn-ghost btn-sm" id="inline-task-cancel">✕</button>
        </div>
    `;

    // Insert at the top of subtasks list
    if (subtasksList.firstChild) {
        subtasksList.insertBefore(inlineInput, subtasksList.firstChild);
    } else {
        subtasksList.appendChild(inlineInput);
    }

    const input = document.getElementById('inline-task-title');
    const saveBtn = document.getElementById('inline-task-save');
    const cancelBtn = document.getElementById('inline-task-cancel');
    const prioritySelect = document.getElementById('inline-task-priority');

    input.focus();

    const saveTask = async () => {
        const title = input.value.trim();
        if (!title) return;

        const priority = parseInt(prioritySelect.value);

        await createNode({
            title,
            mode: 'task',
            parent_id: parentNode.id,
            priority
        });

        inlineInput.remove();
        await refreshAll();
    };

    const cancel = () => {
        inlineInput.remove();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTask();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });

    saveBtn.addEventListener('click', saveTask);
    cancelBtn.addEventListener('click', cancel);
}

// Event handlers
function setupEventListeners() {
    // View toggle
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    // Quick add
    document.getElementById('quick-add-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('quick-add-input');
        const title = input.value.trim();

        if (title) {
            await createNode({ title, mode: 'task' });
            input.value = '';
            await refreshAll();
        }
    });
    
    // Search
    document.getElementById('search-input')?.addEventListener('input', debounce((e) => {
        state.searchQuery = e.target.value;
        refreshTree();
    }, 300));
    
    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            setFilter(chip.dataset.filterType, chip.dataset.filterValue);
        });
    });
    
    // Tree interactions
    document.getElementById('tree-container')?.addEventListener('click', async (e) => {
        // Toggle expand
        if (e.target.classList.contains('node-toggle')) {
            const id = e.target.dataset.id;
            if (state.expandedNodes.has(id)) {
                state.expandedNodes.delete(id);
            } else {
                state.expandedNodes.add(id);
            }
            refreshTree();
            return;
        }
        
        // Toggle checkbox (status)
        if (e.target.classList.contains('node-checkbox')) {
            const id = e.target.dataset.id;
            const currentStatus = e.target.dataset.status;
            const newStatus = currentStatus === 'done' ? 'todo' : 'done';
            await updateNode(id, { status: newStatus });
            await refreshAll();
            return;
        }
        
        // Add subtask
        if (e.target.classList.contains('add-subtask')) {
            const parentId = e.target.dataset.id;
            const title = prompt('Subtask title:');
            if (title) {
                await createNode({ title, mode: 'task', parent_id: parentId });
                state.expandedNodes.add(parentId);
                await refreshAll();
            }
            return;
        }
        
        // Select node
        const nodeItem = e.target.closest('.node-item');
        if (nodeItem) {
            const id = nodeItem.dataset.id;
            state.selectedNode = await fetchNode(id);

            // If ctrl/cmd key is pressed, open in page view
            if (e.ctrlKey || e.metaKey) {
                openInPageView(state.selectedNode);
            } else {
                refreshTree();
                renderDetailPanel(state.selectedNode);
            }
        }
    });
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateForInput(dateStr) {
    const date = new Date(dateStr);
    return date.toISOString().slice(0, 16);
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

function renderWikiLinks(content) {
    // Convert [[Page Name]] to clickable links
    const pattern = /\[\[([^\]]+)\]\]/g;
    let html = escapeHtml(content);
    html = html.replace(pattern, (match, title) => {
        return `<a href="#" class="wiki-link" data-page="${escapeHtml(title)}">[[${escapeHtml(title)}]]</a>`;
    });
    // Convert line breaks to paragraphs
    html = html.split('\n\n').map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('');
    return html;
}

// Refresh functions
async function refreshTree() {
    const tree = await fetchTree();
    state.nodes = tree;
    renderTree(tree, document.getElementById('tree-container'));
}

async function refreshAll() {
    await refreshTree();
    if (state.selectedNode) {
        state.selectedNode = await fetchNode(state.selectedNode.id).catch(() => null);
    }
    await renderDetailPanel(state.selectedNode);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await refreshAll();

    // Expand root nodes by default
    state.nodes.forEach(node => state.expandedNodes.add(node.id));
    refreshTree();

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K to open command palette from anywhere
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();

            // Check if in page view or detail view
            const pageContentText = document.getElementById('page-content-text');
            const detailContent = document.getElementById('detail-content');

            if (pageContentText && state.currentView === 'page' && state.activeTab) {
                showCommandPalette(pageContentText);
            } else if (detailContent && state.selectedNode) {
                showCommandPalette(detailContent);
            }
        }

        // Close command palette on click outside
        if (state.commandPalette.isOpen && e.target.closest && !e.target.closest('#command-palette')) {
            // Check if clicked outside
            if (e.type === 'click') {
                hideCommandPalette();
            }
        }
    });

    // Close command palette on click outside
    document.addEventListener('click', (e) => {
        if (state.commandPalette.isOpen && !e.target.closest('#command-palette') && !e.target.closest('textarea')) {
            hideCommandPalette();
        }
    });
});
