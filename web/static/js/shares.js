registerView('shares', (() => {
  let shares = [];
  let deleteTarget = null;

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});

    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Share Links'));
    titleBlock.appendChild(makeEl('div', { class: 'page-subtitle' }, 'Manage shared file links'));
    header.appendChild(titleBlock);

    const refreshBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Refresh' });
    refreshBtn.appendChild(makeSvg('<polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/>'));
    refreshBtn.addEventListener('click', loadShares);
    header.appendChild(refreshBtn);

    wrap.appendChild(header);

    const tableCard = makeEl('div', { class: 'card', style: { padding: '0', overflow: 'hidden' } });
    tableCard.appendChild(buildTable());
    wrap.appendChild(tableCard);

    wrap.appendChild(buildDeleteModal());

    return wrap;
  }

  function buildTable() {
    const wrap = makeEl('div', { class: 'table-wrap', style: { border: 'none', borderRadius: '0' }, id: 'shares-table-wrap' });
    const table = makeEl('table', { id: 'shares-table' });

    const thead = makeEl('thead');
    const tr = makeEl('tr');
    ['File Name', 'Link', 'Downloads', 'Expires', 'Created', 'Actions'].forEach(label => {
      tr.appendChild(makeEl('th', {}, label));
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = makeEl('tbody', { id: 'shares-tbody' });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderTable() {
    const tbody = document.getElementById('shares-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!shares.length) {
      const tr = makeEl('tr');
      const td = makeEl('td', { colspan: '6' });
      const empty = makeEl('div', { class: 'empty-state' });
      const icon = makeSvg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>', { cls: 'empty-state-icon' });
      empty.appendChild(icon);
      empty.appendChild(makeEl('h3', {}, 'No share links created'));
      empty.appendChild(makeEl('p', {}, 'Share files from the File Browser.'));
      td.appendChild(empty);
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    shares.forEach(share => {
      const tr = makeEl('tr');

      tr.appendChild(makeEl('td', { class: 'td-name' }, share.fileName || share.filePath || '—'));

      const tdLink = makeEl('td', {});
      const url = share.url || (window.location.origin + '/share/' + share.token);
      const linkRow = makeEl('div', { class: 'share-url-row share-url-row-compact' });
      const linkSpan = makeEl('span', { class: 'share-url-truncated', title: url }, url);
      const copyBtn = makeEl('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'Copy link' });
      copyBtn.appendChild(makeSvg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'));
      copyBtn.addEventListener('click', () => {
        navigator.clipboard ? navigator.clipboard.writeText(url) : (function() {
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        })();
        showToast('Copied', 'Link copied to clipboard', 'success');
      });
      linkRow.appendChild(linkSpan);
      linkRow.appendChild(copyBtn);
      tdLink.appendChild(linkRow);
      tr.appendChild(tdLink);

      const dlCount = share.downloads != null ? share.downloads : 0;
      const dlMax = share.maxDownloads || 0;
      const dlText = dlMax === 0 ? dlCount + ' / ∞' : dlCount + ' / ' + dlMax;
      tr.appendChild(makeEl('td', {}, dlText));

      const tdExpires = makeEl('td', {});
      tdExpires.appendChild(buildExpirationBadge(share.expiresAt));
      tr.appendChild(tdExpires);

      tr.appendChild(makeEl('td', {}, formatDate(share.createdAt)));

      const tdAct = makeEl('td', { class: 'td-actions' });

      const copyBtn2 = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Copy link' });
      copyBtn2.appendChild(makeSvg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'));
      copyBtn2.addEventListener('click', () => {
        navigator.clipboard ? navigator.clipboard.writeText(url) : (function() {
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        })();
        showToast('Copied', 'Link copied to clipboard', 'success');
      });
      tdAct.appendChild(copyBtn2);

      const delBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Delete', style: { color: 'var(--danger)' } });
      delBtn.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
      delBtn.addEventListener('click', () => showDeleteModal(share));
      tdAct.appendChild(delBtn);

      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  }

  function buildExpirationBadge(expiresAt) {
    if (!expiresAt) {
      const b = makeEl('span', { class: 'badge badge-success' });
      b.textContent = 'Never';
      return b;
    }
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const diff = exp - now;

    let cls, text;
    if (diff <= 0) {
      cls = 'badge badge-danger';
      text = 'Expired';
    } else if (diff < 86400000) {
      cls = 'badge badge-warning';
      text = 'in ' + Math.ceil(diff / 3600000) + 'h';
    } else {
      cls = 'badge badge-success';
      const days = Math.ceil(diff / 86400000);
      text = 'in ' + days + 'd';
    }

    const b = makeEl('span', { class: cls });
    b.textContent = text;
    return b;
  }

  function buildDeleteModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-delete-share' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header', style: { textAlign: 'center' } });
    const icon = makeEl('div', { class: 'modal-confirm-icon' });
    icon.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
    header.appendChild(icon);
    header.appendChild(makeEl('h3', {}, 'Delete Share Link'));
    const sub = makeEl('p', { id: 'delete-share-msg' });
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

  function showDeleteModal(share) {
    deleteTarget = share;
    const msg = document.getElementById('delete-share-msg');
    const name = share.fileName || share.filePath || share.token;
    if (msg) msg.textContent = 'Delete share link for "' + name + '"? This cannot be undone.';
    document.getElementById('modal-delete-share').classList.remove('hidden');
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api.del('/api/shares/' + encodeURIComponent(deleteTarget.token));
      document.getElementById('modal-delete-share').classList.add('hidden');
      showToast('Deleted', 'Share link removed', 'success');
      loadShares();
    } catch (_) {}
  }

  async function loadShares() {
    const tbody = document.getElementById('shares-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const tr = makeEl('tr', { class: 'loading-row' });
      const td = makeEl('td', { colspan: '6' });
      td.appendChild(makeEl('div', { class: 'spinner', style: { margin: '0 auto' } }));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    try {
      const data = await api.get('/api/shares');
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
    loadShares();
  }

  function destroy() {}

  return { render, init, destroy };
})());
