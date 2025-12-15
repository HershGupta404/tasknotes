/** Shared constants for frontend */
const CONSTANTS = {
    CHORE_PRIORITY: 5,
    PRIORITY_LABELS: {
        1: '🔴 P1 (Urgent)',
        2: '🟠 P2 (High)',
        3: '🟡 P3 (Medium)',
        4: '🟢 P4 (Low)',
        5: '🧹 Chore (Daily)'
    },
    ROOT_NODE_BASE_SIZE: 36,
    NOTE_NODE_SIZE: 12, // derived in graph setup but exposed for reuse
};
