/** General utility helpers shared across views */
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

function getPriorityLabel(priority) {
    const labels = {
        1: '🔴 P1 (Urgent)',
        2: '🟠 P2 (High)',
        3: '🟡 P3 (Medium)',
        4: '🟢 P4 (Low)',
        5: '🧹 Chore (Daily)'
    };
    return labels[priority] || 'Unknown';
}
