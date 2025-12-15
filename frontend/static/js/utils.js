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

function formatOffsetLabel(minutes) {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const hours = Math.floor(abs / 60).toString().padStart(2, '0');
    const mins = (abs % 60).toString().padStart(2, '0');
    return `UTC${sign}${hours}:${mins}`;
}

function getNowMsInTz(offsetMinutes) {
    return Date.now() + offsetMinutes * 60 * 1000;
}

function getMsInTz(dateStr, offsetMinutes) {
    const base = new Date(dateStr).getTime();
    return base + offsetMinutes * 60 * 1000;
}

function formatDateForTz(dateStr, offsetMinutes) {
    const ms = getMsInTz(dateStr, offsetMinutes);
    return new Date(ms).toISOString().slice(0, 10);
}

function getPriorityLabel(priority) {
    return CONSTANTS.PRIORITY_LABELS[priority] || 'Unknown';
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
