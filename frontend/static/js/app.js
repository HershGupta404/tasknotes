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
    searchQuery: ''
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
            <button class="btn-icon add-subtask" data-id="${node.id}" title="Add subtask">+</button>
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

function renderDetailPanel(node) {
    const panel = document.getElementById('detail-panel');
    
    if (!node) {
        panel.innerHTML = `
            <div class="empty-state">
                <p>Select a task or note to view details</p>
            </div>
        `;
        return;
    }
    
    panel.innerHTML = `
        <div class="detail-header">
            <div class="mode-toggle">
                <button class="${node.mode === 'task' ? 'active' : ''}" data-mode="task">Task</button>
                <button class="${node.mode === 'note' ? 'active' : ''}" data-mode="note">Note</button>
            </div>
        </div>
        
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
        
        <div class="detail-section">
            <h3>Content (Markdown)</h3>
            <textarea id="detail-content" placeholder="Add notes, details, or markdown content...">${escapeHtml(node.content || '')}</textarea>
        </div>
        
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

// Event handlers
function setupEventListeners() {
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
            refreshTree();
            renderDetailPanel(state.selectedNode);
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
    renderDetailPanel(state.selectedNode);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await refreshAll();
    
    // Expand root nodes by default
    state.nodes.forEach(node => state.expandedNodes.add(node.id));
    refreshTree();
});
