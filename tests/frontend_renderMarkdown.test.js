// Minimal smoke tests for renderMarkdown/escapeHtml using a lightweight VM context.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const appJsPath = path.join(__dirname, '..', 'frontend', 'static', 'js', 'app.js');
const code = fs.readFileSync(appJsPath, 'utf8');

// Minimal DOM stubs
const makeElement = () => {
  let text = '';
  return {
    set textContent(val) {
      text = val;
      // basic escape to mirror browser behavior
      this.innerHTML = String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },
    get textContent() {
      return text;
    },
    innerHTML: ''
  };
};

const context = {
  console,
  window: {},
  document: {
    addEventListener: () => {}, // ignore DOMContentLoaded handlers
    createElement: makeElement
  },
  fetch: async () => {
    throw new Error('fetch not stubbed in tests');
  },
  setTimeout,
  clearTimeout,
};

vm.createContext(context);
vm.runInContext(code, context);

const { renderMarkdown, escapeHtml } = context;

assert.ok(renderMarkdown, 'renderMarkdown should be available');
assert.ok(escapeHtml, 'escapeHtml should be available');

const rendered = renderMarkdown('**bold** and [[Page]]');
assert.ok(rendered.includes('<strong>bold</strong>'), 'bold should render strong');
assert.ok(rendered.includes('class="wiki-link"'), 'wiki links should render');

const escaped = escapeHtml('<script>alert(1)</script>');
assert.strictEqual(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;');

console.log('frontend_renderMarkdown tests passed');
