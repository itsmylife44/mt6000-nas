registerView('samba', (() => {
  let shares = [];
  let editTarget = null;

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});

    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Samba'));
    titleBlock.appendChild(makeEl('div', { class: 'page-subtitle' }, 'Manage file shares'));
    header.appendChild(titleBlock);
    wrap.appendChild(header);

    wrap.appendChild(buildStatusBanner());

    const card = makeEl('div', { class: 'card', style: { padding: '0', overflow: 'hidden' } });
    const toolbar = buildTableToolbar();
    toolbar.style.padding = '14px 16px';
    toolbar.style.borderBottom = '1px solid var(--border)';
    card.appendChild(toolbar);
    card.appendChild(buildTable());
    wrap.appendChild(card);

    wrap.appendChild(buildShareModal());
    wrap.appendChild(buildDeleteModal());
    return wrap;
  }

  function buildStatusBanner() {
    const banner = makeEl('div', { class: 'status-banner', id: 'samba-status-banner' });

    const info = makeEl('div', { class: 'status-banner-info' });
    const dot = makeEl('div', { class: 'status-dot stopped', id: 'samba-dot' });
    const text = makeEl('div', {});
    const label = makeEl('div', { class: 'status-label', id: 'samba-status-label' }, 'Loading…');
    const detail = makeEl('div', { class: 'status-detail', id: 'samba-status-detail' }, '');
    text.appendChild(label);
    text.appendChild(detail);
    info.appendChild(dot);
    info.appendChild(text);
    banner.appendChild(info);

    const restartBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm' });
    restartBtn.appendChild(makeSvg('<polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/>'));
    restartBtn.appendChild(document.createTextNode('Restart'));
    restartBtn.addEventListener('click', doRestart);
    banner.appendChild(restartBtn);

    return banner;
  }

  function buildTableToolbar() {
    const bar = makeEl('div', { class: 'toolbar' });
    const spacer = makeEl('div', { class: 'toolbar-spacer' });
    bar.appendChild(spacer);
    const addBtn = makeEl('button', { type: 'button', class: 'btn btn-primary btn-sm' });
    addBtn.appendChild(makeSvg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'));
    addBtn.appendChild(document.createTextNode('Add Share'));
    addBtn.addEventListener('click', () => showShareModal(null));
    bar.appendChild(addBtn);
    return bar;
  }

  function buildTable() {
    const wrap = makeEl('div', { class: 'table-wrap', style: { border: 'none', borderRadius: '0' }, id: 'samba-table-wrap' });
    const table = makeEl('table', { id: 'samba-table' });

    const thead = makeEl('thead');
    const tr = makeEl('tr');
    ['Name', 'Path', 'Read Only', 'Guest OK', 'Valid Users', 'Actions'].forEach(label => {
      tr.appendChild(makeEl('th', {}, label));
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    table.appendChild(makeEl('tbody', { id: 'samba-tbody' }));
    wrap.appendChild(table);
    return wrap;
  }

  function renderTable() {
    const tbody = document.getElementById('samba-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!shares.length) {
      const tr = makeEl('tr');
      const td = makeEl('td', { colspan: '6', style: { textAlign: 'center', padding: '40px', color: 'var(--text-muted)' } }, 'No shares configured');
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    shares.forEach(share => {
      const tr = makeEl('tr');

      tr.appendChild(makeEl('td', { class: 'td-name' }, share.name));
      tr.appendChild(makeEl('td', { style: { fontFamily: 'var(--font-mono)', fontSize: '0.8rem' } }, share.path || '—'));

      const roTd = makeEl('td');
      roTd.appendChild(makeBool(share.read_only || share.readOnly));
      tr.appendChild(roTd);

      const guestTd = makeEl('td');
      guestTd.appendChild(makeBool(share.guest_ok || share.guestOk));
      tr.appendChild(guestTd);

      const users = share.valid_users || share.validUsers || '';
      tr.appendChild(makeEl('td', { style: { fontSize: '0.82rem', color: 'var(--text-muted)' } }, users || 'All'));

      const actTd = makeEl('td', { class: 'td-actions' });

      const editBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Edit' });
      editBtn.appendChild(makeSvg('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'));
      editBtn.addEventListener('click', () => showShareModal(share));
      actTd.appendChild(editBtn);

      const delBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Delete', style: { color: 'var(--danger)' } });
      delBtn.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
      delBtn.addEventListener('click', () => showDeleteModal(share));
      actTd.appendChild(delBtn);

      tr.appendChild(actTd);
      tbody.appendChild(tr);
    });
  }

  function makeBool(val) {
    const badge = makeEl('span', { class: 'badge ' + (val ? 'badge-success' : 'badge-info') });
    badge.textContent = val ? 'Yes' : 'No';
    return badge;
  }

  function buildShareModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-share' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header' });
    header.appendChild(makeEl('h3', { id: 'share-modal-title' }, 'Add Share'));
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body' });

    const nameGrp = makeEl('div', { class: 'form-group' });
    nameGrp.appendChild(makeEl('label', { for: 'share-name' }, 'Share name'));
    nameGrp.appendChild(makeEl('input', { type: 'text', id: 'share-name', placeholder: 'media' }));
    body.appendChild(nameGrp);

    const pathGrp = makeEl('div', { class: 'form-group' });
    pathGrp.appendChild(makeEl('label', { for: 'share-path' }, 'Path'));
    pathGrp.appendChild(makeEl('input', { type: 'text', id: 'share-path', placeholder: '/mnt/storage/media' }));
    body.appendChild(pathGrp);

    const usersGrp = makeEl('div', { class: 'form-group' });
    usersGrp.appendChild(makeEl('label', { for: 'share-users' }, 'Valid users (comma-separated, leave empty for all)'));
    usersGrp.appendChild(makeEl('input', { type: 'text', id: 'share-users', placeholder: 'alice, bob' }));
    body.appendChild(usersGrp);

    const checkRow = makeEl('div', { class: 'form-row' });

    const roLabel = makeEl('label', { class: 'form-check' });
    const roInput = makeEl('input', { type: 'checkbox', id: 'share-readonly' });
    roLabel.appendChild(roInput);
    roLabel.appendChild(makeEl('span', {}, 'Read Only'));
    checkRow.appendChild(roLabel);

    const guestLabel = makeEl('label', { class: 'form-check' });
    const guestInput = makeEl('input', { type: 'checkbox', id: 'share-guest' });
    guestLabel.appendChild(guestInput);
    guestLabel.appendChild(makeEl('span', {}, 'Allow guests'));
    checkRow.appendChild(guestLabel);

    body.appendChild(checkRow);
    modal.appendChild(body);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const save = makeEl('button', { type: 'button', class: 'btn btn-primary', id: 'share-save-btn' }, 'Save');
    save.addEventListener('click', doSaveShare);
    footer.appendChild(cancel);
    footer.appendChild(save);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function buildDeleteModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-delete-share' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header', style: { textAlign: 'center' } });
    const icon = makeEl('div', { class: 'modal-confirm-icon' });
    icon.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
    header.appendChild(icon);
    header.appendChild(makeEl('h3', {}, 'Delete Share'));
    header.appendChild(makeEl('p', { id: 'delete-share-msg' }, ''));
    modal.appendChild(header);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const del = makeEl('button', { type: 'button', class: 'btn btn-danger' }, 'Delete');
    del.addEventListener('click', doDeleteShare);
    footer.appendChild(cancel);
    footer.appendChild(del);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  let deleteTarget = null;

  function showShareModal(share) {
    editTarget = share;
    const title = document.getElementById('share-modal-title');
    if (title) title.textContent = share ? 'Edit Share' : 'Add Share';

    document.getElementById('share-name').value = share ? (share.name || '') : '';
    document.getElementById('share-path').value = share ? (share.path || '') : '';
    document.getElementById('share-users').value = share ? (share.valid_users || share.validUsers || '') : '';
    document.getElementById('share-readonly').checked = share ? !!(share.read_only || share.readOnly) : false;
    document.getElementById('share-guest').checked = share ? !!(share.guest_ok || share.guestOk) : false;

    document.getElementById('modal-share').classList.remove('hidden');
    document.getElementById('share-name').focus();
  }

  function showDeleteModal(share) {
    deleteTarget = share;
    const msg = document.getElementById('delete-share-msg');
    if (msg) msg.textContent = 'Remove share "' + share.name + '"?';
    document.getElementById('modal-delete-share').classList.remove('hidden');
  }

  async function doSaveShare() {
    const name = document.getElementById('share-name').value.trim();
    const path = document.getElementById('share-path').value.trim();
    const users = document.getElementById('share-users').value.trim();
    const readOnly = document.getElementById('share-readonly').checked;
    const guestOk = document.getElementById('share-guest').checked;

    if (!name || !path) {
      showToast('Validation', 'Name and path are required', 'warning');
      return;
    }

    const payload = { name, path, read_only: readOnly, guest_ok: guestOk, valid_users: users };

    try {
      if (editTarget) {
        await api.put('/api/samba/shares/' + encodeURIComponent(editTarget.name), payload);
        showToast('Updated', name, 'success');
      } else {
        await api.post('/api/samba/shares', payload);
        showToast('Created', name, 'success');
      }
      document.getElementById('modal-share').classList.add('hidden');
      loadShares();
    } catch (_) {}
  }

  async function doDeleteShare() {
    if (!deleteTarget) return;
    try {
      await api.del('/api/samba/shares/' + encodeURIComponent(deleteTarget.name));
      document.getElementById('modal-delete-share').classList.add('hidden');
      showToast('Deleted', deleteTarget.name, 'success');
      loadShares();
    } catch (_) {}
  }

  async function doRestart() {
    try {
      await api.post('/api/samba/status', { action: 'restart' });
      showToast('Samba', 'Restart requested', 'info');
      setTimeout(loadStatus, 1500);
    } catch (_) {}
  }

  async function loadStatus() {
    try {
      const data = await api.get('/api/samba/status');
      const running = data.running || data.status === 'running';
      const clients = data.clients || data.connected_clients || 0;
      const dot = document.getElementById('samba-dot');
      const label = document.getElementById('samba-status-label');
      const detail = document.getElementById('samba-status-detail');
      if (dot) { dot.className = 'status-dot ' + (running ? 'running' : 'stopped'); }
      if (label) label.textContent = running ? 'Running' : 'Stopped';
      if (detail) detail.textContent = running ? clients + ' client(s) connected' : 'Service is not running';
    } catch (_) {
      const label = document.getElementById('samba-status-label');
      if (label) label.textContent = 'Unknown';
    }
  }

  async function loadShares() {
    const tbody = document.getElementById('samba-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const tr = makeEl('tr', { class: 'loading-row' });
      const td = makeEl('td', { colspan: '6' });
      td.appendChild(makeEl('div', { class: 'spinner', style: { margin: '0 auto' } }));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    try {
      const data = await api.get('/api/samba/shares');
      shares = Array.isArray(data) ? data : (data.shares || []);
      renderTable();
    } catch (_) {
      if (tbody) {
        tbody.innerHTML = '';
        const tr = makeEl('tr');
        const td = makeEl('td', { colspan: '6', class: 'error-state' }, 'Failed to load shares');
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }
  }

  function init() {
    loadStatus();
    loadShares();
  }

  function destroy() {}

  return { render, init, destroy };
})());
