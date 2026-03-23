registerView('users', (() => {
  let users = [];
  let pwTarget = null;
  let deleteTarget = null;

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});

    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Users'));
    titleBlock.appendChild(makeEl('div', { class: 'page-subtitle' }, 'Manage NAS users'));
    header.appendChild(titleBlock);
    wrap.appendChild(header);

    const card = makeEl('div', { class: 'card', style: { padding: '0', overflow: 'hidden' } });
    const toolbar = buildToolbar();
    toolbar.style.padding = '14px 16px';
    toolbar.style.borderBottom = '1px solid var(--border)';
    card.appendChild(toolbar);
    card.appendChild(buildTable());
    wrap.appendChild(card);

    wrap.appendChild(buildAddModal());
    wrap.appendChild(buildPasswordModal());
    wrap.appendChild(buildDeleteModal());
    return wrap;
  }

  function buildToolbar() {
    const bar = makeEl('div', { class: 'toolbar' });
    const spacer = makeEl('div', { class: 'toolbar-spacer' });
    bar.appendChild(spacer);
    const addBtn = makeEl('button', { type: 'button', class: 'btn btn-primary btn-sm' });
    addBtn.appendChild(makeSvg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'));
    addBtn.appendChild(document.createTextNode('Add User'));
    addBtn.addEventListener('click', () => showAddModal());
    bar.appendChild(addBtn);
    return bar;
  }

  function buildTable() {
    const wrap = makeEl('div', { class: 'table-wrap', style: { border: 'none', borderRadius: '0' } });
    const table = makeEl('table', { id: 'users-table' });

    const thead = makeEl('thead');
    const tr = makeEl('tr');
    ['Username', 'Actions'].forEach(label => { tr.appendChild(makeEl('th', {}, label)); });
    thead.appendChild(tr);
    table.appendChild(thead);
    table.appendChild(makeEl('tbody', { id: 'users-tbody' }));
    wrap.appendChild(table);
    return wrap;
  }

  function renderTable() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!users.length) {
      const tr = makeEl('tr');
      const td = makeEl('td', { colspan: '2', style: { textAlign: 'center', padding: '40px', color: 'var(--text-muted)' } }, 'No users');
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    users.forEach(user => {
      const username = user.username || user.name || String(user);
      const tr = makeEl('tr');

      const nameTd = makeEl('td', { class: 'td-name' });
      nameTd.appendChild(makeSvg('<circle cx="12" cy="8" r="4"/><path d="M4 20v-2a8 8 0 0116 0v2"/>', { cls: 'file-icon file-icon-doc' }));
      nameTd.appendChild(document.createTextNode(username));
      tr.appendChild(nameTd);

      const actTd = makeEl('td', { class: 'td-actions' });

      const pwBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Change Password' });
      pwBtn.appendChild(makeSvg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'));
      pwBtn.addEventListener('click', () => showPasswordModal(username));
      actTd.appendChild(pwBtn);

      const delBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Delete', style: { color: 'var(--danger)' } });
      delBtn.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
      delBtn.addEventListener('click', () => showDeleteModal(username));
      actTd.appendChild(delBtn);

      tr.appendChild(actTd);
      tbody.appendChild(tr);
    });
  }

  function buildAddModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-adduser' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header' });
    header.appendChild(makeEl('h3', {}, 'Add User'));
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body' });

    const usernameGrp = makeEl('div', { class: 'form-group' });
    usernameGrp.appendChild(makeEl('label', { for: 'adduser-username' }, 'Username'));
    usernameGrp.appendChild(makeEl('input', { type: 'text', id: 'adduser-username', placeholder: 'alice', autocomplete: 'off' }));
    body.appendChild(usernameGrp);

    const pwGrp = makeEl('div', { class: 'form-group' });
    pwGrp.appendChild(makeEl('label', { for: 'adduser-password' }, 'Password'));
    pwGrp.appendChild(makeEl('input', { type: 'password', id: 'adduser-password', autocomplete: 'new-password' }));
    body.appendChild(pwGrp);

    const confirmGrp = makeEl('div', { class: 'form-group' });
    confirmGrp.appendChild(makeEl('label', { for: 'adduser-confirm' }, 'Confirm password'));
    confirmGrp.appendChild(makeEl('input', { type: 'password', id: 'adduser-confirm', autocomplete: 'new-password' }));
    body.appendChild(confirmGrp);

    body.appendChild(makeEl('div', { class: 'form-error hidden', id: 'adduser-error' }));
    modal.appendChild(body);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const save = makeEl('button', { type: 'button', class: 'btn btn-primary' }, 'Create');
    save.addEventListener('click', doAddUser);
    footer.appendChild(cancel);
    footer.appendChild(save);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function buildPasswordModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-changepassword' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header' });
    header.appendChild(makeEl('h3', {}, 'Change Password'));
    header.appendChild(makeEl('p', { id: 'pw-modal-subtitle' }, ''));
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body' });

    const pwGrp = makeEl('div', { class: 'form-group' });
    pwGrp.appendChild(makeEl('label', { for: 'changepw-password' }, 'New password'));
    pwGrp.appendChild(makeEl('input', { type: 'password', id: 'changepw-password', autocomplete: 'new-password' }));
    body.appendChild(pwGrp);

    const confirmGrp = makeEl('div', { class: 'form-group' });
    confirmGrp.appendChild(makeEl('label', { for: 'changepw-confirm' }, 'Confirm password'));
    confirmGrp.appendChild(makeEl('input', { type: 'password', id: 'changepw-confirm', autocomplete: 'new-password' }));
    body.appendChild(confirmGrp);

    body.appendChild(makeEl('div', { class: 'form-error hidden', id: 'changepw-error' }));
    modal.appendChild(body);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const save = makeEl('button', { type: 'button', class: 'btn btn-primary' }, 'Change');
    save.addEventListener('click', doChangePassword);
    footer.appendChild(cancel);
    footer.appendChild(save);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function buildDeleteModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-deleteuser' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header', style: { textAlign: 'center' } });
    const icon = makeEl('div', { class: 'modal-confirm-icon' });
    icon.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
    header.appendChild(icon);
    header.appendChild(makeEl('h3', {}, 'Delete User'));
    header.appendChild(makeEl('p', { id: 'deleteuser-msg' }, ''));
    modal.appendChild(header);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const del = makeEl('button', { type: 'button', class: 'btn btn-danger' }, 'Delete');
    del.addEventListener('click', doDeleteUser);
    footer.appendChild(cancel);
    footer.appendChild(del);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function showAddModal() {
    document.getElementById('adduser-username').value = '';
    document.getElementById('adduser-password').value = '';
    document.getElementById('adduser-confirm').value = '';
    setError('adduser-error', '');
    document.getElementById('modal-adduser').classList.remove('hidden');
    document.getElementById('adduser-username').focus();
  }

  function showPasswordModal(username) {
    pwTarget = username;
    const sub = document.getElementById('pw-modal-subtitle');
    if (sub) sub.textContent = 'User: ' + username;
    document.getElementById('changepw-password').value = '';
    document.getElementById('changepw-confirm').value = '';
    setError('changepw-error', '');
    document.getElementById('modal-changepassword').classList.remove('hidden');
    document.getElementById('changepw-password').focus();
  }

  function showDeleteModal(username) {
    deleteTarget = username;
    const msg = document.getElementById('deleteuser-msg');
    if (msg) msg.textContent = 'Delete user "' + username + '"? This cannot be undone.';
    document.getElementById('modal-deleteuser').classList.remove('hidden');
  }

  function setError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }

  async function doAddUser() {
    const username = document.getElementById('adduser-username').value.trim();
    const password = document.getElementById('adduser-password').value;
    const confirm  = document.getElementById('adduser-confirm').value;

    if (!username) { setError('adduser-error', 'Username is required'); return; }
    if (!password) { setError('adduser-error', 'Password is required'); return; }
    if (password !== confirm) { setError('adduser-error', 'Passwords do not match'); return; }

    try {
      await api.post('/api/samba/users', { username, password });
      document.getElementById('modal-adduser').classList.add('hidden');
      showToast('Created', username, 'success');
      loadUsers();
    } catch (_) {}
  }

  async function doChangePassword() {
    if (!pwTarget) return;
    const password = document.getElementById('changepw-password').value;
    const confirm  = document.getElementById('changepw-confirm').value;

    if (!password) { setError('changepw-error', 'Password is required'); return; }
    if (password !== confirm) { setError('changepw-error', 'Passwords do not match'); return; }

    try {
      await api.put('/api/samba/users/' + encodeURIComponent(pwTarget), { password });
      document.getElementById('modal-changepassword').classList.add('hidden');
      showToast('Updated', 'Password changed for ' + pwTarget, 'success');
    } catch (_) {}
  }

  async function doDeleteUser() {
    if (!deleteTarget) return;
    try {
      await api.del('/api/samba/users/' + encodeURIComponent(deleteTarget));
      document.getElementById('modal-deleteuser').classList.add('hidden');
      showToast('Deleted', deleteTarget, 'success');
      loadUsers();
    } catch (_) {}
  }

  async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const tr = makeEl('tr', { class: 'loading-row' });
      const td = makeEl('td', { colspan: '2' });
      td.appendChild(makeEl('div', { class: 'spinner', style: { margin: '0 auto' } }));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    try {
      const data = await api.get('/api/samba/users');
      users = Array.isArray(data) ? data : (data.users || []);
      renderTable();
    } catch (_) {
      if (tbody) {
        tbody.innerHTML = '';
        const tr = makeEl('tr');
        const td = makeEl('td', { colspan: '2', class: 'error-state' }, 'Failed to load users');
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }
  }

  function init() { loadUsers(); }
  function destroy() {}

  return { render, init, destroy };
})());
