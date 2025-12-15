/**
 * TaskNotes - Frontend Application
 */

// State
const state = {
    nodes: [],
    selectedNode: null,
    expandedNodes: new Set(),
    filters: {
        mode: null,
        status: null,
        priority: [],
        tags: [],
        dateFrom: null,
        dateTo: null,
        showSubtasks: false,
        showDependencies: false,
        showCompletedRoots: false
    },
    createModalTags: [],
    searchQuery: '',
    currentView: 'tree', // 'tree', 'page', 'graph', 'priority'
    openTabs: [],  // Array of {id, title, node}
    activeTab: null,
    timezoneOffsetMinutes: 0,
    commandPalette: {
        isOpen: false,
        element: null,
        selectedIndex: 0,
        commands: []
    }
};

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
    const dueMs = getMsInTz(dueDateStr);
    const nowMs = getNowMsInTz();
    const diffDays = Math.ceil((dueMs - nowMs) / (1000 * 60 * 60 * 24));

    let label = formatDateForTz(dueDateStr);
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

    // Render markdown content
    const contentRendered = renderMarkdown(node.content);

    panel.innerHTML = `
        <div class="detail-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h2 style="margin: 0; font-size: 1.2rem;">${node.mode === 'task' ? '📋' : '📝'} ${escapeHtml(node.title)}</h2>
            <button class="btn btn-primary" id="edit-node-btn">Edit</button>
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
            <h3>Metadata</h3>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; font-size: 0.9rem;">
                <div style="color: var(--text-secondary); font-weight: 500;">Type:</div>
                <div>${node.mode === 'task' ? '📋 Task' : '📝 Note'}</div>

                ${node.mode === 'task' ? `
                    <div style="color: var(--text-secondary); font-weight: 500;">Status:</div>
                    <div><span class="node-badge badge-${node.status}">${node.status}</span></div>

                    <div style="color: var(--text-secondary); font-weight: 500;">Priority:</div>
                    <div>${getPriorityLabel(node.priority)}</div>

                    ${node.due_date ? `
                        <div style="color: var(--text-secondary); font-weight: 500;">Due Date:</div>
                        <div>${renderDueBadge(node.due_date)}</div>
                    ` : ''}
                ` : ''}

                ${node.tags && node.tags.length > 0 ? `
                    <div style="color: var(--text-secondary); font-weight: 500;">Tags:</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${node.tags.map(tag => `
                            <span class="tag-chip" style="cursor: default;">
                                ${escapeHtml(tag)}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
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
            <h3>Content</h3>
            <div class="content-renderer" style="padding: 12px; background: var(--bg-primary); border-radius: 6px; min-height: 100px;">
                ${contentRendered}
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
                ${node.mode === 'task' && node.computed_priority ? `<p>Priority Score: ${node.computed_priority.toFixed(1)}</p>` : ''}
            </div>
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
            let targetNode = await findNodeByTitle(title);

            // If node doesn't exist, create it as a note
            if (!targetNode) {
                const newNode = await createNode({
                    title: title,
                    mode: 'note',
                    content: ''
                });
                targetNode = { id: newNode.id };
            }

            state.selectedNode = await fetchNode(targetNode.id);
            refreshTree();
            await renderDetailPanel(state.selectedNode);
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
    // Edit button - opens node in page view for editing
    document.getElementById('edit-node-btn')?.addEventListener('click', () => {
        openInPageView(node);
    });
}

// Filter functions
// Helper: Collect all node IDs in subtask DAG (recursive)
function collectSubtaskDAG(node, collected = new Set()) {
    if (collected.has(node.id)) return collected;
    collected.add(node.id);

    if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
            collectSubtaskDAG(child, collected);
        });
    }

    return collected;
}

// Helper: Collect all nodes that should be shown for DAG expansion
function getDAGInclusionSet() {
    const included = new Set();

    // If showSubtasks is on, collect all nodes in matching subtask hierarchies
    if (state.filters.showSubtasks) {
        const allNodes = getAllNodesFlat(state.nodes);
        allNodes.forEach(node => {
            // If this node matches filters, include its entire subtask DAG
            if (matchesFiltersBase(node)) {
                collectSubtaskDAG(node, included);

                // Also include all ancestors up to root
                let current = node;
                while (current.parent_id) {
                    included.add(current.parent_id);
                    current = allNodes.find(n => n.id === current.parent_id) || { parent_id: null };
                }
            }
        });
    }

    // If showDependencies is on, we'd need to fetch dependency links
    // For now, we'll handle this in the graph view

    return included;
}

// Helper: Get all nodes as flat array
function getAllNodesFlat(nodes, result = []) {
    nodes.forEach(node => {
        result.push(node);
        if (node.children && node.children.length > 0) {
            getAllNodesFlat(node.children, result);
        }
    });
    return result;
}

// Base filter check without DAG logic
function matchesFiltersBase(node) {
    // Mode filter
    if (state.filters.mode && node.mode !== state.filters.mode) return false;

    // Status filter - only applies to tasks, so hide notes if status filter is active
    if (state.filters.status) {
        if (node.mode !== 'task') return false;
        if (node.status !== state.filters.status) return false;
    }

    // Priority filter - only applies to tasks, so hide notes if priority filter is active
    if (state.filters.priority && state.filters.priority.length > 0) {
        if (node.mode !== 'task') return false;
        if (!state.filters.priority.includes(node.priority.toString()) &&
            !state.filters.priority.includes(node.priority)) {
            return false;
        }
    }

    // Date range filter - only applies to tasks with due dates
    if (state.filters.dateFrom || state.filters.dateTo) {
        if (node.mode !== 'task') return false;
        if (!node.due_date) return false;

        const dueMs = getMsInTz(node.due_date);
        if (state.filters.dateFrom) {
            const from = new Date(state.filters.dateFrom).getTime();
            if (dueMs < from) return false;
        }
        if (state.filters.dateTo) {
            const to = new Date(state.filters.dateTo);
            to.setHours(23, 59, 59, 999);
            if (dueMs > to.getTime()) return false;
        }
    }

    // Tags filter - node must have at least ONE of the specified tags
    if (state.filters.tags && state.filters.tags.length > 0) {
        const nodeTags = new Set(node.tags || []);
        const hasAnyTag = state.filters.tags.some(tag => nodeTags.has(tag));
        if (!hasAnyTag) return false;
    }

    // Search query
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        if (!node.title.toLowerCase().includes(query) &&
            !(node.content || '').toLowerCase().includes(query)) {
            return false;
        }
    }

    // Hide completed root tasks by default
    if (!state.filters.showCompletedRoots &&
        node.mode === 'task' &&
        node.status === 'done' &&
        !node.parent_id) {
        return false;
    }

    return true;
}

function matchesFilters(node) {
    // If showSubtasks is enabled, check if node should be included in DAG
    if (state.filters.showSubtasks) {
        const dagInclusion = getDAGInclusionSet();
        if (dagInclusion.size > 0 && dagInclusion.has(node.id)) {
            return true;
        }
    }

    // Otherwise, use base filters
    return matchesFiltersBase(node);
}

function setFilter(type, value) {
    if (type === 'priority') {
        const idx = state.filters.priority.indexOf(value);
        if (idx >= 0) {
            state.filters.priority.splice(idx, 1);
        } else {
            state.filters.priority.push(value);
        }
    } else {
        state.filters[type] = state.filters[type] === value ? null : value;
    }
    refreshTree();
    if (state.currentView === 'graph') {
        loadGraph();
    }
    updateFilterUI();
}

function updateFilterUI() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const filterType = chip.dataset.filterType;
        const filterValue = chip.dataset.filterValue;

        // For priority, compare as integer
        if (filterType === 'priority') {
            chip.classList.toggle('active', state.filters[filterType].includes(filterValue));
        } else {
            chip.classList.toggle('active', state.filters[filterType] === filterValue);
        }
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

    if (viewName === 'priority') {
        loadPriorityView();
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

                    <div class="form-group" style="margin-top: 16px;">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; display: block;">Tags</label>
                        <div class="tags-input-container">
                            <input type="text" id="page-tags-input" list="tags-autocomplete" placeholder="Type a tag and press Enter...">
                            <div id="page-tags-display" class="tags-display">
                                ${(node.tags || []).map(tag => `
                                    <span class="tag-chip">
                                        ${escapeHtml(tag)}
                                        <span class="remove-tag" onclick="removePageTag('${escapeHtml(tag)}')">×</span>
                                    </span>
                                `).join('')}
                            </div>
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

            // Setup page tags input
            if (!tab.node.tags) tab.node.tags = [];
            document.getElementById('page-tags-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const input = e.target;
                    const tag = input.value.trim();
                    if (tag && !tab.node.tags.includes(tag)) {
                        tab.node.tags.push(tag);
                        input.value = '';

                        // Re-render tags display
                        const displayEl = document.getElementById('page-tags-display');
                        if (displayEl) {
                            displayEl.innerHTML = tab.node.tags.map(t => `
                                <span class="tag-chip">
                                    ${escapeHtml(t)}
                                    <span class="remove-tag" onclick="removePageTag('${escapeHtml(t)}')">×</span>
                                </span>
                            `).join('');
                        }
                    }
                }
            });

            // Setup save handler
            document.getElementById('save-page-btn')?.addEventListener('click', async () => {
                const updates = {
                    title: document.getElementById('page-title').value,
                    content: document.getElementById('page-content-text').value,
                    mode: document.getElementById('page-mode').value,
                    tags: tab.node.tags || []
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
                    let targetNode = await findNodeByTitle(title);

                    // If node doesn't exist, create it as a note
                    if (!targetNode) {
                        const newNode = await createNode({
                            title: title,
                            mode: 'note',
                            content: ''
                        });
                        targetNode = { id: newNode.id };
                        await refreshTree();
                    }

                    const fullNode = await fetchNode(targetNode.id);
                    openInPageView(fullNode);
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

        // Apply filters to graph data
        const filteredData = applyGraphFilters(data);
        renderGraph(filteredData);
    } catch (error) {
        console.error('Failed to load graph:', error);
    }
}

// Priority View Functions
async function loadPriorityView() {
    const container = document.getElementById('priority-view-content');
    if (!container) return;

    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}?parent_id=all&mode=task`);
        const tasks = await res.json();
        const nowMs = getNowMsInTz();
        const horizonMs = nowMs + 14 * 24 * 60 * 60 * 1000;

        const dueSoon = tasks.filter(t => {
            if (!t.due_date) return false;
            const dueMs = getMsInTz(t.due_date);
            return dueMs <= horizonMs;
        });

        const sorted = dueSoon.sort((a, b) => (b.computed_priority || 0) - (a.computed_priority || 0));
        const chores = sorted.filter(t => t.priority === 5);
        const main = sorted.filter(t => t.priority !== 5);

        const renderList = (items) => {
            if (items.length === 0) {
                return `<div class="empty-state"><p>No tasks in this bucket</p></div>`;
            }
            return items.map(t => `
                <div class="priority-card" data-id="${t.id}">
                    <div class="priority-card-header">
                        <div class="priority-card-title">${escapeHtml(t.title)}</div>
                        <div class="priority-card-score">${(t.computed_priority || 0).toFixed(1)}</div>
                    </div>
                    <div class="priority-card-meta">
                        <span class="priority-card-label">${getPriorityLabel(t.priority)}</span>
                        ${t.due_date ? renderDueBadge(t.due_date) : '<span class="node-badge badge-note">No due date</span>'}
                        <span class="node-badge badge-${t.status}">${t.status}</span>
                    </div>
                </div>
            `).join('');
        };

        container.innerHTML = `
            <div class="priority-section">
                <h4>Priority Tasks (P1-P4)</h4>
                ${renderList(main)}
            </div>
            <div class="priority-section">
                <h4>Chores (P5)</h4>
                ${renderList(chores)}
            </div>
        `;

        container.querySelectorAll('.priority-card').forEach(card => {
            card.addEventListener('click', async () => {
                const id = card.dataset.id;
                state.selectedNode = await fetchNode(id);
                renderDetailPanel(state.selectedNode);
            });
        });
    } catch (error) {
        console.error('Failed to load priority view:', error);
        container.innerHTML = `<div class="empty-state"><p>Error loading priority view</p></div>`;
    }
}

function applyGraphFilters(graphData) {
    // Get all nodes that match filters
    const matchedNodeIds = new Set();

    // Check if any actual filters are active (excluding DAG options)
    const hasActiveFilters = state.filters.mode || state.filters.status || state.filters.priority ||
                             state.filters.dateFrom || state.filters.dateTo ||
                             (state.filters.tags && state.filters.tags.length > 0) ||
                             state.searchQuery;

    // First pass: Check which nodes match base filters
    graphData.nodes.forEach(node => {
        if (matchesFiltersBase(node)) {
            matchedNodeIds.add(node.id);
        }
    });

    // If DAG options are enabled but no other filters, we want to show all nodes
    // because the DAG expansion should work from the full set
    if (!hasActiveFilters && (state.filters.showSubtasks || state.filters.showDependencies)) {
        graphData.nodes.forEach(node => matchedNodeIds.add(node.id));
    }

    // If showSubtasks is enabled, include entire subtask DAG
    if (state.filters.showSubtasks && matchedNodeIds.size > 0) {
        const nodesToInclude = new Set(matchedNodeIds);

        matchedNodeIds.forEach(nodeId => {
            const node = graphData.nodes.find(n => n.id === nodeId);
            if (node) {
                // Include all descendants (subtasks)
                const descendants = getAllDescendants(graphData, nodeId);
                descendants.forEach(id => nodesToInclude.add(id));

                // Include all ancestors up to root
                const ancestors = getAllAncestors(graphData, nodeId);
                ancestors.forEach(id => nodesToInclude.add(id));
            }
        });

        matchedNodeIds.clear();
        nodesToInclude.forEach(id => matchedNodeIds.add(id));
    }

    // If showDependencies is enabled, include all dependent nodes
    if (state.filters.showDependencies && matchedNodeIds.size > 0) {
        const nodesToInclude = new Set(matchedNodeIds);

        matchedNodeIds.forEach(nodeId => {
            // Include all nodes connected via dependency links
            const dependencyConnected = getAllDependencyConnected(graphData, nodeId);
            dependencyConnected.forEach(id => nodesToInclude.add(id));
        });

        matchedNodeIds.clear();
        nodesToInclude.forEach(id => matchedNodeIds.add(id));
    }

    // Filter nodes and edges
    const filteredNodes = graphData.nodes.filter(n => matchedNodeIds.has(n.id));
    const filteredEdges = graphData.edges.filter(e =>
        matchedNodeIds.has(e.source) && matchedNodeIds.has(e.target)
    );

    return {
        nodes: filteredNodes,
        edges: filteredEdges
    };
}

function getAllDescendants(graphData, nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);

    // Find all child edges (hierarchy type)
    graphData.edges
        .filter(e => e.type === 'hierarchy' && e.source === nodeId)
        .forEach(edge => {
            getAllDescendants(graphData, edge.target, visited);
        });

    return visited;
}

function getAllAncestors(graphData, nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return visited;

    // Find parent edges (hierarchy type)
    graphData.edges
        .filter(e => e.type === 'hierarchy' && e.target === nodeId)
        .forEach(edge => {
            visited.add(edge.source);
            getAllAncestors(graphData, edge.source, visited);
        });

    return visited;
}

function getAllDependencyConnected(graphData, nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);

    // Find all dependency edges connected to this node
    graphData.edges
        .filter(e => e.type === 'dependency' && (e.source === nodeId || e.target === nodeId))
        .forEach(edge => {
            const connectedId = edge.source === nodeId ? edge.target : edge.source;
            getAllDependencyConnected(graphData, connectedId, visited);
        });

    return visited;
}

function renderGraph(graphData) {
    const container = document.getElementById('graph-container');
    container.innerHTML = ''; // Clear existing graph

    const width = container.clientWidth;
    const height = container.clientHeight;
    const totalNodes = graphData.nodes.length;

    // Make sure root nodes stay visually dominant
    const ROOT_NODE_BASE_SIZE = 36;
    const NOTE_NODE_SIZE = ROOT_NODE_BASE_SIZE / 3;
    graphData.nodes.forEach(node => {
        if (node.mode === 'note') {
            node.size = NOTE_NODE_SIZE;
        }
        if (node.is_root && node.mode === 'task') {
            node.size = Math.max(node.size || 0, ROOT_NODE_BASE_SIZE);
        }
    });

    // Precompute link counts for scaling forces
    const linkCounts = new Map();
    graphData.nodes.forEach(n => linkCounts.set(n.id, 0));
    const getNodeId = (node) => typeof node === 'object' ? node.id : node;
    graphData.edges.forEach(edge => {
        const sourceId = getNodeId(edge.source);
        const targetId = getNodeId(edge.target);
        linkCounts.set(sourceId, (linkCounts.get(sourceId) || 0) + 1);
        linkCounts.set(targetId, (linkCounts.get(targetId) || 0) + 1);
    });

    // Connected component sizes (undirected over all links)
    const adjacency = new Map();
    graphData.nodes.forEach(n => adjacency.set(n.id, new Set()));
    graphData.edges.forEach(edge => {
        const s = getNodeId(edge.source);
        const t = getNodeId(edge.target);
        adjacency.get(s)?.add(t);
        adjacency.get(t)?.add(s);
    });

    const componentOf = new Map();
    const componentSize = new Map();
    graphData.nodes.forEach(node => {
        if (componentOf.has(node.id)) return;
        const queue = [node.id];
        const members = [];
        while (queue.length > 0) {
            const current = queue.pop();
            if (componentOf.has(current)) continue;
            componentOf.set(current, node.id); // use root id as component key
            members.push(current);
            adjacency.get(current)?.forEach(nextId => {
                if (!componentOf.has(nextId)) queue.push(nextId);
            });
        }
        members.forEach(id => componentSize.set(id, members.length));
    });

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
                const base = Math.max(
                    ROOT_NODE_BASE_SIZE * 1.9,
                    d.type === 'hierarchy' ? 70 : d.type === 'dependency' ? 115 : 105
                );
                const sourceLinks = linkCounts.get(getNodeId(d.source)) || 0;
                const targetLinks = linkCounts.get(getNodeId(d.target)) || 0;
                const maxLinks = Math.max(sourceLinks, targetLinks);
                const componentSpan = Math.max(
                    componentSize.get(getNodeId(d.source)) || 1,
                    componentSize.get(getNodeId(d.target)) || 1
                );
                const degreeSpread = d.type === 'dependency'
                    ? Math.min(1.8, 1 + (maxLinks / 10))
                    : Math.min(2.0, 1.05 + (maxLinks / 7));
                const componentSpread = Math.min(1.6, 1 + (componentSpan / 18));
                return base * degreeSpread * componentSpread;
            })
            .strength(d => {
                const componentSpan = Math.max(
                    componentSize.get(getNodeId(d.source)) || 1,
                    componentSize.get(getNodeId(d.target)) || 1
                );
                const compStrength = Math.min(1.25, 1 + (componentSpan / 120));
                return 0.85 * compStrength;
            }))
        .force('charge', d3.forceManyBody()
            .strength(d => {
                // Fewer links = softer repulsion; modest boost as graphs get larger
                const linkCount = linkCounts.get(d.id) || 0;
                const graphScale = Math.min(1.55, 1.05 + (totalNodes / 140));
                const linkFactor = linkCount === 0 ? 0.6 : linkCount === 1 ? 0.95 : 1.15;
                const sizeFactor = Math.max(0.5, (d.size || NOTE_NODE_SIZE) / ROOT_NODE_BASE_SIZE);
                const componentSpan = componentSize.get(d.id) || 1;
                const componentRepel = Math.min(1.25, 1 + (componentSpan / 80));
                const noteIsolationFactor = (d.mode === 'note' && linkCount === 0) ? 0.35 : 1;
                return -230 * graphScale * linkFactor * sizeFactor * componentRepel * noteIsolationFactor;
            })
            .distanceMax(210))
        .force('collision', d3.forceCollide().radius(d => d.size + 18).iterations(2));

    // Create arrow markers for directed edges
    svg.append('defs').selectAll('marker')
        .data(['dependency'])
        .join('marker')
        .attr('id', d => `arrow-${d}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 15)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', '#fbbf24')
        .attr('d', 'M0,-5L10,0L0,5');

    // Add arrow markers to both ends of hierarchical links
    svg.select('defs').append('marker')
        .attr('id', 'arrow-hierarchy-start')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', -15)
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
        .attr('refX', 15)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', '#e94560')
        .attr('d', 'M0,-5L10,0L0,5');

    // Draw links with shortened endpoints to account for node radius
    const link = g.append('g')
        .selectAll('path')
        .data(graphData.edges)
        .join('path')
        .attr('class', d => `graph-link ${d.type}`)
        .attr('fill', 'none')
        .attr('marker-end', d => d.type === 'dependency' ? 'url(#arrow-dependency)' : null);

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
        .on('click', async (event, d) => {
            event.stopPropagation();
            const fullNode = await fetchNode(d.id);
            state.selectedNode = fullNode;
            await renderDetailPanel(fullNode);
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
        // Update links to stop at node edge
        link.attr('d', d => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = Math.sqrt(dx * dx + dy * dy);

            // Calculate angle
            const angle = Math.atan2(dy, dx);

            // Shorten line by node radius on both ends
            const sourceRadius = d.source.size || 12;
            const targetRadius = d.target.size || 12;

            const sourceX = d.source.x + Math.cos(angle) * sourceRadius;
            const sourceY = d.source.y + Math.sin(angle) * sourceRadius;
            const targetX = d.target.x - Math.cos(angle) * targetRadius;
            const targetY = d.target.y - Math.sin(angle) * targetRadius;

            return `M${sourceX},${sourceY}L${targetX},${targetY}`;
        });

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

    // Timezone selector
    document.getElementById('timezone-select')?.addEventListener('change', (e) => {
        const offset = parseInt(e.target.value, 10);
        updateTimezone(offset);
    });

    // Date filter inputs
    document.getElementById('filter-date-from')?.addEventListener('change', (e) => {
        state.filters.dateFrom = e.target.value || null;
        refreshTree();
        if (state.currentView === 'graph') {
            loadGraph();
        }
    });

    document.getElementById('filter-date-to')?.addEventListener('change', (e) => {
        state.filters.dateTo = e.target.value || null;
        refreshTree();
        if (state.currentView === 'graph') {
            loadGraph();
        }
    });

    // Checkbox filters
    document.getElementById('filter-show-subtasks')?.addEventListener('change', (e) => {
        state.filters.showSubtasks = e.target.checked;
        refreshTree();
        if (state.currentView === 'graph') {
            loadGraph();
        }
    });

    document.getElementById('filter-show-dependencies')?.addEventListener('change', (e) => {
        state.filters.showDependencies = e.target.checked;
        refreshTree();
        if (state.currentView === 'graph') {
            loadGraph();
        }
    });

    document.getElementById('filter-show-completed')?.addEventListener('change', (e) => {
        state.filters.showCompletedRoots = e.target.checked;
        refreshTree();
        if (state.currentView === 'graph') {
            loadGraph();
        }
    });

    // Tags filter input
    document.getElementById('filter-tags-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.target;
            const tag = input.value.trim();
            if (tag && !state.filters.tags.includes(tag)) {
                state.filters.tags.push(tag);
                input.value = '';
                renderTagsDisplay('filter');
                refreshTree();
                if (state.currentView === 'graph') {
                    loadGraph();
                }
            }
        }
    });

    // Create modal tags input
    document.getElementById('create-tags-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.target;
            const tag = input.value.trim();
            if (tag && !state.createModalTags.includes(tag)) {
                state.createModalTags.push(tag);
                input.value = '';
                renderTagsDisplay('create');
            }
        }
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

function formatOffsetLabel(minutes) {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const hours = Math.floor(abs / 60).toString().padStart(2, '0');
    const mins = (abs % 60).toString().padStart(2, '0');
    return `UTC${sign}${hours}:${mins}`;
}

function getNowMsInTz() {
    return Date.now() + state.timezoneOffsetMinutes * 60 * 1000;
}

function getMsInTz(dateStr) {
    const base = new Date(dateStr).getTime();
    return base + state.timezoneOffsetMinutes * 60 * 1000;
}

function formatDateForTz(dateStr) {
    const ms = getMsInTz(dateStr);
    return new Date(ms).toISOString().slice(0, 10);
}

async function loadTimezoneSetting() {
    try {
        const res = await fetch('/api/nodes/timezone');
        const data = await res.json();
        state.timezoneOffsetMinutes = data.offset_minutes || 0;
    } catch (e) {
        console.error('Failed to load timezone', e);
    }

    // Populate select
    const select = document.getElementById('timezone-select');
    if (!select) return;
    const options = [];
    for (let offset = -720; offset <= 840; offset += 60) {
        options.push(`<option value="${offset}">${formatOffsetLabel(offset)}</option>`);
    }
    select.innerHTML = options.join('');
    select.value = state.timezoneOffsetMinutes.toString();
}

async function updateTimezone(offsetMinutes) {
    try {
        await fetch('/api/nodes/timezone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offset_minutes: offsetMinutes })
        });
        state.timezoneOffsetMinutes = offsetMinutes;
        await refreshAll();
        if (state.currentView === 'graph') loadGraph();
        if (state.currentView === 'priority') loadPriorityView();
    } catch (e) {
        console.error('Failed to update timezone', e);
    }
}

// Tags management functions
function getAllTags() {
    const tagsSet = new Set();
    const collectTags = (nodes) => {
        nodes.forEach(node => {
            if (node.tags && Array.isArray(node.tags)) {
                node.tags.forEach(tag => tagsSet.add(tag));
            }
            if (node.children && node.children.length > 0) {
                collectTags(node.children);
            }
        });
    };
    collectTags(state.nodes);
    return Array.from(tagsSet).sort();
}

function updateTagsAutocomplete() {
    const datalist = document.getElementById('tags-autocomplete');
    if (!datalist) return;

    const allTags = getAllTags();
    datalist.innerHTML = allTags.map(tag => `<option value="${escapeHtml(tag)}"></option>`).join('');
}

function renderTagsDisplay(context) {
    const displayId = context === 'filter' ? 'filter-tags-display' : 'create-tags-display';
    const tagsArray = context === 'filter' ? state.filters.tags : state.createModalTags;
    const displayEl = document.getElementById(displayId);

    if (!displayEl) return;

    displayEl.innerHTML = tagsArray.map(tag => `
        <span class="tag-chip">
            ${escapeHtml(tag)}
            <span class="remove-tag" onclick="removeTag('${escapeHtml(tag)}', '${context}')">×</span>
        </span>
    `).join('');
}

function removeTag(tag, context) {
    if (context === 'filter') {
        state.filters.tags = state.filters.tags.filter(t => t !== tag);
        renderTagsDisplay('filter');
        refreshTree();
        if (state.currentView === 'graph') {
            loadGraph();
        }
    } else if (context === 'create') {
        state.createModalTags = state.createModalTags.filter(t => t !== tag);
        renderTagsDisplay('create');
    }
}

function removeDetailTag(tag) {
    if (!state.selectedNode) return;

    // Update the current node's tags in memory
    state.selectedNode.tags = (state.selectedNode.tags || []).filter(t => t !== tag);

    // Re-render the tags display
    const displayEl = document.getElementById('detail-tags-display');
    if (displayEl) {
        displayEl.innerHTML = (state.selectedNode.tags || []).map(t => `
            <span class="tag-chip">
                ${escapeHtml(t)}
                <span class="remove-tag" onclick="removeDetailTag('${escapeHtml(t)}')">×</span>
            </span>
        `).join('');
    }
}

function removePageTag(tag) {
    if (!state.activeTab) return;
    const tab = state.openTabs.find(t => t.id === state.activeTab);
    if (!tab || !tab.node) return;

    // Update the tab's node tags in memory
    tab.node.tags = (tab.node.tags || []).filter(t => t !== tag);

    // Re-render the tags display
    const displayEl = document.getElementById('page-tags-display');
    if (displayEl) {
        displayEl.innerHTML = tab.node.tags.map(t => `
            <span class="tag-chip">
                ${escapeHtml(t)}
                <span class="remove-tag" onclick="removePageTag('${escapeHtml(t)}')">×</span>
            </span>
        `).join('');
    }
}

function renderMarkdown(content) {
    if (!content) return '<p style="color: var(--text-secondary);">No content</p>';

    let html = escapeHtml(content);

    // Convert wiki links first (before other markdown)
    html = html.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
        return `<a href="#" class="wiki-link" data-page="${escapeHtml(title)}">[[${escapeHtml(title)}]]</a>`;
    });

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Unordered lists
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');

    // Line breaks and paragraphs
    html = html.split('\n\n').map(para => {
        if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<pre')) {
            return para;
        }
        return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
}

function renderWikiLinks(content) {
    // Backward compatibility - just use renderMarkdown
    return renderMarkdown(content);
}

// Refresh functions
async function refreshTree() {
    const tree = await fetchTree();
    state.nodes = tree;
    renderTree(tree, document.getElementById('tree-container'));
    updateTagsAutocomplete();
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
    await loadTimezoneSetting();
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
