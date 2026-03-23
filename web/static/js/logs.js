registerView('logs', (() => {
  let activeTab = 'system';
  let autoRefresh = false;
  let refreshTimer = null;
  let logLines = [];

  const TABS = [
    { key: 'system', label: 'System Log', url: '/api/logs/system' },
    { key: 'samba',  label: 'Samba Log',  url: '/api/logs/samba'  },
  ];

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});

    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Logs'));
    titleBlock.appendChild(makeEl('div', { class: 'page-subtitle' }, 'System and service logs'));
    header.appendChild(titleBlock);
    wrap.appendChild(header);

    const card = makeEl('div', { class: 'card' });
    card.appendChild(buildTabs());
    card.appendChild(buildControls());
    card.appendChild(buildLogOutput());
    wrap.appendChild(card);

    return wrap;
  }

  function buildTabs() {
    const tabBar = makeEl('div', { class: 'tabs' });
    TABS.forEach(tab => {
      const btn = makeEl('button', { type: 'button', class: 'tab-btn' + (tab.key === activeTab ? ' active' : ''), 'data-tab': tab.key });
      btn.textContent = tab.label;
      btn.addEventListener('click', () => switchTab(tab.key));
      tabBar.appendChild(btn);
    });
    return tabBar;
  }

  function buildControls() {
    const bar = makeEl('div', { class: 'log-controls' });

    const refreshBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm' });
    refreshBtn.appendChild(makeSvg('<polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/>'));
    refreshBtn.appendChild(document.createTextNode('Refresh'));
    refreshBtn.addEventListener('click', () => loadLog());
    bar.appendChild(refreshBtn);

    const autoLabel = makeEl('label', { class: 'toggle', id: 'auto-refresh-toggle' });
    const toggleWrap = makeEl('div', { class: 'toggle-switch' });
    const toggleInput = makeEl('input', { type: 'checkbox', id: 'auto-refresh-check' });
    const track = makeEl('div', { class: 'toggle-track' });
    const thumb = makeEl('div', { class: 'toggle-thumb' });
    toggleWrap.appendChild(toggleInput);
    toggleWrap.appendChild(track);
    toggleWrap.appendChild(thumb);
    autoLabel.appendChild(toggleWrap);
    autoLabel.appendChild(makeEl('span', { class: 'toggle-label' }, 'Auto-refresh'));
    toggleInput.addEventListener('change', () => {
      autoRefresh = toggleInput.checked;
      if (autoRefresh) {
        refreshTimer = setInterval(loadLog, 3000);
      } else {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    });
    bar.appendChild(autoLabel);

    const dlBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm' });
    dlBtn.appendChild(makeSvg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>'));
    dlBtn.appendChild(document.createTextNode('Download'));
    dlBtn.addEventListener('click', downloadLog);
    bar.appendChild(dlBtn);

    const clearBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm' });
    clearBtn.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
    clearBtn.appendChild(document.createTextNode('Clear'));
    clearBtn.addEventListener('click', clearLog);
    bar.appendChild(clearBtn);

    bar.appendChild(makeEl('span', { class: 'log-count', id: 'log-count' }, '0 lines'));
    return bar;
  }

  function buildLogOutput() {
    const output = makeEl('div', { class: 'log-output', id: 'log-output' });
    output.textContent = 'Loading…';
    return output;
  }

  function switchTab(key) {
    if (key === activeTab) return;
    activeTab = key;
    logLines = [];

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === key);
    });

    loadLog();
  }

  function classifyLine(line) {
    const lower = line.toLowerCase();
    if (/\b(error|err|crit|emerg|alert|fail|fatal)\b/.test(lower)) return 'log-line-error';
    if (/\b(warn|warning)\b/.test(lower)) return 'log-line-warning';
    if (/\b(info|notice|debug)\b/.test(lower)) return 'log-line-info';
    return 'log-line-default';
  }

  function renderLog() {
    const output = document.getElementById('log-output');
    if (!output) return;
    output.innerHTML = '';

    if (!logLines.length) {
      output.textContent = 'No log entries.';
      updateCount(0);
      return;
    }

    const frag = document.createDocumentFragment();
    logLines.forEach(line => {
      const span = makeEl('span', { class: classifyLine(line) });
      span.textContent = line + '\n';
      frag.appendChild(span);
    });
    output.appendChild(frag);
    output.scrollTop = output.scrollHeight;
    updateCount(logLines.length);
  }

  function updateCount(n) {
    const el = document.getElementById('log-count');
    if (el) el.textContent = n + ' line' + (n === 1 ? '' : 's');
  }

  async function loadLog() {
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab) return;

    const output = document.getElementById('log-output');
    if (output && !logLines.length) output.textContent = 'Loading…';

    try {
      const data = await api.get(tab.url);
      if (typeof data === 'string') {
        logLines = data.split('\n').filter(l => l.length > 0);
      } else if (Array.isArray(data)) {
        logLines = data;
      } else if (data && typeof data.log === 'string') {
        logLines = data.log.split('\n').filter(l => l.length > 0);
      } else if (data && Array.isArray(data.lines)) {
        logLines = data.lines;
      } else {
        logLines = [];
      }
      renderLog();
    } catch (_) {
      if (output) {
        output.textContent = 'Failed to load log.';
        updateCount(0);
      }
    }
  }

  function clearLog() {
    logLines = [];
    const output = document.getElementById('log-output');
    if (output) output.textContent = '';
    updateCount(0);
  }

  function downloadLog() {
    const tab = TABS.find(t => t.key === activeTab);
    if (!tab) return;
    const filename = activeTab + '.log';
    api.download(tab.url, filename);
  }

  function init() {
    loadLog();
  }

  function destroy() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    autoRefresh = false;
  }

  return { render, init, destroy };
})());
