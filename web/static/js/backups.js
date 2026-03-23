registerView('backups', (() => {
  let backups = [];
  let deleteTarget = null;

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});

    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Backups'));
    titleBlock.appendChild(makeEl('div', { class: 'page-subtitle' }, 'Create and restore backups'));
    header.appendChild(titleBlock);

    const createBtn = makeEl('button', { type: 'button', class: 'btn btn-primary', id: 'backup-create-btn' });
    createBtn.appendChild(makeSvg('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/>'));
    createBtn.appendChild(document.createTextNode('Create Backup'));
    createBtn.addEventListener('click', doCreateBackup);
    header.appendChild(createBtn);

    wrap.appendChild(header);

    const statusCard = makeEl('div', { class: 'card', id: 'backup-status-card' });
    statusCard.appendChild(buildStatusCardBody());
    wrap.appendChild(statusCard);

    const tableCard = makeEl('div', { class: 'card', style: { padding: '0', overflow: 'hidden', marginTop: '16px' } });
    tableCard.appendChild(buildTable());
    wrap.appendChild(tableCard);

    wrap.appendChild(buildDeleteModal());

    return wrap;
  }

  function buildStatusCardBody() {
    const grid = makeEl('div', { class: 'card-grid', id: 'backup-stat-grid', style: { marginBottom: '0' } });

    const cards = [
      { id: 'stat-last', label: 'Last Backup', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>' },
      { id: 'stat-total', label: 'Total Backups', icon: '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/>'},
      { id: 'stat-size', label: 'Total Size', icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>' },
    ];

    cards.forEach(c => {
      const card = makeEl('div', { class: 'card', id: c.id });
      const hdr = makeEl('div', { class: 'card-header' });
      const titleEl = makeEl('div', { class: 'card-title' });
      const icon = makeSvg(c.icon);
      icon.style.width = '14px'; icon.style.height = '14px';
      titleEl.appendChild(icon);
      titleEl.appendChild(document.createTextNode(c.label));
      hdr.appendChild(titleEl);
      card.appendChild(hdr);
      const val = makeEl('div', { class: 'card-value', id: c.id + '-val' }, '—');
      card.appendChild(val);
      grid.appendChild(card);
    });

    return grid;
  }

  function setStatVal(id, text) {
    const el = document.getElementById(id + '-val');
    if (el) el.textContent = text;
  }

  function buildTable() {
    const wrap = makeEl('div', { class: 'table-wrap', style: { border: 'none', borderRadius: '0' }, id: 'backups-table-wrap' });
    const table = makeEl('table', { id: 'backups-table' });

    const thead = makeEl('thead');
    const tr = makeEl('tr');
    ['Name', 'Size', 'Created', 'Actions'].forEach(label => {
      tr.appendChild(makeEl('th', {}, label));
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = makeEl('tbody', { id: 'backups-tbody' });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderTable() {
    const tbody = document.getElementById('backups-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!backups.length) {
      const tr = makeEl('tr');
      const td = makeEl('td', { colspan: '4' });
      const empty = makeEl('div', { class: 'empty-state' });
      const icon = makeSvg('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/>', { cls: 'empty-state-icon' });
      empty.appendChild(icon);
      empty.appendChild(makeEl('h3', {}, 'No backups yet'));
      empty.appendChild(makeEl('p', {}, 'Create your first backup above.'));
      td.appendChild(empty);
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    backups.forEach(backup => {
      const tr = makeEl('tr');

      tr.appendChild(makeEl('td', { class: 'td-name' }, backup.name));
      tr.appendChild(makeEl('td', {}, formatBytes(backup.size)));
      tr.appendChild(makeEl('td', {}, formatDate(backup.createdAt)));

      const tdAct = makeEl('td', { class: 'td-actions' });

      const dlBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm', title: 'Download' });
      dlBtn.appendChild(makeSvg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>'));
      dlBtn.appendChild(document.createTextNode('Download'));
      dlBtn.addEventListener('click', () => {
        api.download('/api/backup/download/' + encodeURIComponent(backup.name), backup.name);
      });
      tdAct.appendChild(dlBtn);

      const delBtn = makeEl('button', { type: 'button', class: 'btn btn-danger btn-sm', title: 'Delete' });
      delBtn.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
      delBtn.appendChild(document.createTextNode('Delete'));
      delBtn.addEventListener('click', () => showDeleteModal(backup));
      tdAct.appendChild(delBtn);

      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function buildDeleteModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-delete-backup' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header', style: { textAlign: 'center' } });
    const icon = makeEl('div', { class: 'modal-confirm-icon' });
    icon.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
    header.appendChild(icon);
    header.appendChild(makeEl('h3', {}, 'Delete Backup'));
    const sub = makeEl('p', { id: 'delete-backup-msg' });
    header.appendChild(sub);
    modal.appendChild(header);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const del = makeEl('button', { type: 'button', class: 'btn btn-danger' }, 'Delete');
    del.addEventListener('click', doDelete);
    footer.appendChild(cancel);
    footer.appendChild(del);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function showDeleteModal(backup) {
    deleteTarget = backup;
    const msg = document.getElementById('delete-backup-msg');
    if (msg) msg.textContent = 'Delete backup "' + backup.name + '"? This cannot be undone.';
    document.getElementById('modal-delete-backup').classList.remove('hidden');
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api.del('/api/backup/' + encodeURIComponent(deleteTarget.name));
      document.getElementById('modal-delete-backup').classList.add('hidden');
      showToast('Deleted', 'Backup removed', 'success');
      loadAll();
    } catch (_) {}
  }

  async function doCreateBackup() {
    const btn = document.getElementById('backup-create-btn');
    if (btn) {
      btn.disabled = true;
      const spinner = makeEl('span', { class: 'btn-spinner' });
      btn.insertBefore(spinner, btn.firstChild);
    }

    try {
      const result = await api.post('/api/backup/create', {});
      showToast('Backup created', result.name || 'New backup ready', 'success');
      loadAll();
    } catch (_) {
    } finally {
      if (btn) {
        btn.disabled = false;
        const spinner = btn.querySelector('.btn-spinner');
        if (spinner) spinner.remove();
      }
    }
  }

  async function loadStatus() {
    try {
      const data = await api.get('/api/backup/status');
      setStatVal('stat-last', data.lastBackup ? formatDate(data.lastBackup) : 'Never');
      setStatVal('stat-total', String(data.totalBackups || 0));
      setStatVal('stat-size', formatBytes(data.totalSize || 0));
    } catch (_) {
      setStatVal('stat-last', 'Error');
    }
  }

  async function loadBackups() {
    const tbody = document.getElementById('backups-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const tr = makeEl('tr', { class: 'loading-row' });
      const td = makeEl('td', { colspan: '4' });
      td.appendChild(makeEl('div', { class: 'spinner', style: { margin: '0 auto' } }));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    try {
      const data = await api.get('/api/backup/list');
      backups = Array.isArray(data) ? data : (data.backups || []);
      renderTable();
    } catch (_) {
      if (tbody) {
        tbody.innerHTML = '';
        const tr = makeEl('tr');
        const td = makeEl('td', { colspan: '4', class: 'error-state' }, 'Failed to load backups');
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }
  }

  async function loadAll() {
    await Promise.allSettled([loadStatus(), loadBackups()]);
  }

  function init() {
    loadAll();
  }

  function destroy() {}

  return { render, init, destroy };
})());
