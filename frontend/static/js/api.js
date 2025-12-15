/** API helpers */
const API_BASE = '/api/nodes';

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
