registerView('files', (() => {
  let currentPath = '/';
  let sortKey = 'name';
  let sortAsc = true;
  let entries = [];

  const IMAGE_EXTS = ['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp'];
  const VIDEO_EXTS = ['.mp4','.webm','.mkv','.avi','.mov'];
  const AUDIO_EXTS = ['.mp3','.ogg','.flac','.wav','.aac','.m4a'];

  function getExt(name) {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot).toLowerCase() : '';
  }

  function isImage(name) { return IMAGE_EXTS.includes(getExt(name)); }
  function isVideo(name) { return VIDEO_EXTS.includes(getExt(name)); }
  function isAudio(name) { return AUDIO_EXTS.includes(getExt(name)); }

  const FILE_TYPES = {
    folder: { cls: 'file-icon-folder', svg: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>' },
    image:  { cls: 'file-icon-image',  svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/>' },
    video:  { cls: 'file-icon-video',  svg: '<polygon points="23,7 16,12 23,17"/><rect x="1" y="5" width="15" height="14" rx="2"/>' },
    audio:  { cls: 'file-icon-audio',  svg: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' },
    doc:    { cls: 'file-icon-doc',    svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
    archive:{ cls: 'file-icon-archive',svg: '<polyline points="21,8 21,21 3,21 3,8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>' },
    code:   { cls: 'file-icon-code',   svg: '<polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/>' },
    generic:{ cls: 'file-icon-generic', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>' },
  };

  const EXT_MAP = {
    jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image', svg:'image', bmp:'image', ico:'image',
    mp4:'video', mkv:'video', avi:'video', mov:'video', wmv:'video', flv:'video', webm:'video',
    mp3:'audio', wav:'audio', flac:'audio', ogg:'audio', aac:'audio', m4a:'audio',
    pdf:'doc', doc:'doc', docx:'doc', txt:'doc', md:'doc', xls:'doc', xlsx:'doc', csv:'doc', ppt:'doc', pptx:'doc',
    zip:'archive', tar:'archive', gz:'archive', bz2:'archive', xz:'archive', rar:'archive', '7z':'archive',
    js:'code', ts:'code', py:'code', go:'code', rs:'code', c:'code', cpp:'code', h:'code', sh:'code', json:'code', xml:'code', yaml:'code', yml:'code', html:'code', css:'code',
  };

  function fileType(entry) {
    if (entry.type === 'dir' || entry.isDir || entry.is_dir) return 'folder';
    const ext = (entry.name || '').split('.').pop().toLowerCase();
    return EXT_MAP[ext] || 'generic';
  }

  function fileIcon(entry) {
    const t = fileType(entry);
    const info = FILE_TYPES[t] || FILE_TYPES.generic;
    const svg = makeSvg(info.svg, { cls: 'file-icon ' + info.cls });
    return svg;
  }

  function isDir(entry) { return fileType(entry) === 'folder'; }

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});
    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Files'));
    titleBlock.appendChild(makeEl('div', { class: 'page-subtitle' }, 'Browse and manage files'));
    header.appendChild(titleBlock);
    wrap.appendChild(header);

    wrap.appendChild(buildBreadcrumb());
    wrap.appendChild(buildToolbar());
    wrap.appendChild(buildDropZone());
    wrap.appendChild(buildUploadList());

    const tableCard = makeEl('div', { class: 'card', style: { padding: '0', overflow: 'hidden' }, id: 'files-table-card' });
    tableCard.appendChild(buildTable());
    wrap.appendChild(tableCard);

    wrap.appendChild(buildModals());
    return wrap;
  }

  function buildBreadcrumb() {
    const bc = makeEl('div', { class: 'breadcrumb', id: 'files-breadcrumb' });
    renderBreadcrumb(bc);
    return bc;
  }

  function renderBreadcrumb(bc) {
    bc = bc || document.getElementById('files-breadcrumb');
    if (!bc) return;
    bc.innerHTML = '';

    const parts = currentPath.split('/').filter(Boolean);

    const root = makeEl('span', { class: 'breadcrumb-item' }, '/');
    root.addEventListener('click', () => navigate('/'));
    bc.appendChild(root);

    parts.forEach((part, i) => {
      const sep = makeEl('span', { class: 'breadcrumb-sep' }, '/');
      bc.appendChild(sep);

      const path = '/' + parts.slice(0, i + 1).join('/');
      const isLast = i === parts.length - 1;
      const item = makeEl('span', { class: 'breadcrumb-item' + (isLast ? ' current' : '') }, part);
      if (!isLast) item.addEventListener('click', () => navigate(path));
      bc.appendChild(item);
    });
  }

  function buildToolbar() {
    const bar = makeEl('div', { class: 'toolbar' });

    const uploadBtn = makeEl('button', { type: 'button', class: 'btn btn-primary btn-sm' });
    uploadBtn.appendChild(makeSvg('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19,12 12,5 5,12"/>'));
    uploadBtn.appendChild(document.createTextNode('Upload'));
    uploadBtn.addEventListener('click', () => document.getElementById('files-input').click());
    bar.appendChild(uploadBtn);

    const input = makeEl('input', { type: 'file', id: 'files-input', multiple: 'true', style: { display: 'none' } });
    input.addEventListener('change', () => handleFileInput(input.files));
    bar.appendChild(input);

    const folderBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm' });
    folderBtn.appendChild(makeSvg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>'));
    folderBtn.appendChild(document.createTextNode('New Folder'));
    folderBtn.addEventListener('click', () => showNewFolderModal());
    bar.appendChild(folderBtn);

    const spacer = makeEl('div', { class: 'toolbar-spacer' });
    bar.appendChild(spacer);

    const refreshBtn = makeEl('button', { type: 'button', class: 'btn-icon' });
    refreshBtn.appendChild(makeSvg('<polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/>'));
    refreshBtn.addEventListener('click', () => loadDir(currentPath));
    bar.appendChild(refreshBtn);

    return bar;
  }

  function buildDropZone() {
    const zone = makeEl('div', { class: 'drop-zone', id: 'files-dropzone' });
    const icon = makeSvg('<polyline points="16,16 12,12 8,16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>', { cls: 'drop-zone-icon' });
    zone.appendChild(icon);
    zone.appendChild(document.createTextNode('Drop files here or click Upload'));

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFileInput(e.dataTransfer.files);
    });
    zone.addEventListener('click', () => document.getElementById('files-input').click());

    return zone;
  }

  function buildUploadList() {
    return makeEl('div', { class: 'upload-list', id: 'files-upload-list' });
  }

  async function handleFileInput(files) {
    const list = document.getElementById('files-upload-list');
    const uploadFiles = Array.from(files);

    for (const file of uploadFiles) {
      const item = buildUploadItem(file.name);
      list.appendChild(item);

      const fd = new FormData();
      fd.append('file', file);
      fd.append('path', currentPath);

      try {
        await api.upload('/api/files/upload', fd, (pct) => {
          const fill = item.querySelector('.progress-fill');
          if (fill) fill.style.width = pct + '%';
        });
        item.remove();
        showToast('Uploaded', file.name, 'success');
      } catch (_) {
        item.remove();
      }
    }

    loadDir(currentPath);
  }

  function buildUploadItem(name) {
    const item = makeEl('div', { class: 'upload-item' });
    const n = makeEl('div', { class: 'upload-item-name' }, name);
    item.appendChild(n);
    const bar = makeEl('div', { class: 'progress-bar upload-progress' });
    const fill = makeEl('div', { class: 'progress-fill' });
    fill.style.width = '0%';
    bar.appendChild(fill);
    item.appendChild(bar);
    return item;
  }

  function buildTable() {
    const wrap = makeEl('div', { class: 'table-wrap', style: { border: 'none', borderRadius: '0' }, id: 'files-table-wrap' });
    const table = makeEl('table', { id: 'files-table' });

    const thead = makeEl('thead');
    const tr = makeEl('tr');
    [
      { key: 'name', label: 'Name' },
      { key: 'size', label: 'Size' },
      { key: 'modified', label: 'Modified' },
      { key: null, label: 'Actions' },
    ].forEach(col => {
      const th = makeEl('th', col.key ? { class: 'sortable' } : {});
      th.textContent = col.label;
      if (col.key) {
        const sortIcon = makeEl('span', { class: 'sort-icon' });
        th.appendChild(sortIcon);
        th.dataset.key = col.key;
        if (col.key === sortKey) th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
        th.addEventListener('click', () => {
          if (sortKey === col.key) sortAsc = !sortAsc;
          else { sortKey = col.key; sortAsc = true; }
          renderTable();
        });
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = makeEl('tbody', { id: 'files-tbody' });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderTable() {
    const tbody = document.getElementById('files-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const headers = document.querySelectorAll('#files-table th[data-key]');
    headers.forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.key === sortKey) th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
    });

    const sorted = entries.slice().sort((a, b) => {
      const da = isDir(a), db = isDir(b);
      if (da !== db) return da ? -1 : 1;

      let va, vb;
      if (sortKey === 'name') { va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); }
      else if (sortKey === 'size') { va = a.size || 0; vb = b.size || 0; }
      else if (sortKey === 'modified') { va = a.modified || a.mod_time || ''; vb = b.modified || b.mod_time || ''; }
      else { va = ''; vb = ''; }

      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    if (!sorted.length) {
      const tr = makeEl('tr');
      const td = makeEl('td', { colspan: '4', style: { textAlign: 'center', padding: '40px', color: 'var(--text-muted)' } }, 'Empty directory');
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    sorted.forEach(entry => {
      const tr = makeEl('tr', {});
      const dir = isDir(entry);

      const tdName = makeEl('td', { class: 'td-name' });
      tdName.appendChild(fileIcon(entry));
      tdName.appendChild(document.createTextNode(entry.name));
      tr.appendChild(tdName);

      const tdSize = makeEl('td', {}, dir ? '—' : formatBytes(entry.size));
      tr.appendChild(tdSize);

      const tdMod = makeEl('td', {}, formatDate(entry.modified || entry.mod_time));
      tr.appendChild(tdMod);

      const tdAct = makeEl('td', { class: 'td-actions' });
      tdAct.appendChild(buildActionsMenu(entry));
      tr.appendChild(tdAct);

      if (dir) {
        tr.classList.add('row-clickable');
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('.td-actions')) navigate(joinPath(currentPath, entry.name));
        });
      } else {
        tdName.style.cursor = 'pointer';
        tdName.addEventListener('click', () => openFile(entry));
      }

      tbody.appendChild(tr);
    });
  }

  function buildActionsMenu(entry) {
    const wrap = makeEl('div', { class: 'btn-group' });

    if (!isDir(entry)) {
      const dlBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Download' });
      dlBtn.appendChild(makeSvg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>'));
      dlBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadFile(entry); });
      wrap.appendChild(dlBtn);

      const shareBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Share' });
      shareBtn.appendChild(makeSvg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>'));
      shareBtn.addEventListener('click', (e) => { e.stopPropagation(); showShareModal(entry); });
      wrap.appendChild(shareBtn);
    }

    const renBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Rename' });
    renBtn.appendChild(makeSvg('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'));
    renBtn.addEventListener('click', (e) => { e.stopPropagation(); showRenameModal(entry); });
    wrap.appendChild(renBtn);

    const delBtn = makeEl('button', { type: 'button', class: 'btn-icon', title: 'Delete', style: { color: 'var(--danger)' } });
    delBtn.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'));
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); showDeleteModal(entry); });
    wrap.appendChild(delBtn);

    return wrap;
  }

  function buildModals() {
    const frag = document.createDocumentFragment();
    frag.appendChild(buildNewFolderModal());
    frag.appendChild(buildRenameModal());
    frag.appendChild(buildDeleteModal());
    frag.appendChild(buildShareModal());
    frag.appendChild(buildLightbox());
    frag.appendChild(buildMediaModal());
    return frag;
  }

  function buildShareModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-share' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header' });
    header.appendChild(makeEl('h3', {}, 'Create Share Link'));
    const sub = makeEl('p', { id: 'share-modal-filename' });
    header.appendChild(sub);
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body' });

    const fg1 = makeEl('div', { class: 'form-group' });
    fg1.appendChild(makeEl('label', { for: 'share-expires' }, 'Expires in'));
    const expiresEl = makeEl('select', { id: 'share-expires' });
    [['3600','1 hour'],['86400','24 hours'],['604800','7 days'],['2592000','30 days'],['0','Never']].forEach(([v, t]) => {
      const opt = makeEl('option', { value: v }, t);
      if (v === '86400') opt.selected = true;
      expiresEl.appendChild(opt);
    });
    fg1.appendChild(expiresEl);
    body.appendChild(fg1);

    const fg2 = makeEl('div', { class: 'form-group' });
    fg2.appendChild(makeEl('label', { for: 'share-maxdl' }, 'Max downloads'));
    const maxdlEl = makeEl('select', { id: 'share-maxdl' });
    [['0','Unlimited'],['1','1'],['5','5'],['10','10'],['50','50']].forEach(([v, t]) => {
      const opt = makeEl('option', { value: v }, t);
      maxdlEl.appendChild(opt);
    });
    fg2.appendChild(maxdlEl);
    body.appendChild(fg2);

    const resultEl = makeEl('div', { class: 'share-result hidden', id: 'share-result' });
    const urlRow = makeEl('div', { class: 'share-url-row' });
    const urlInput = makeEl('input', { type: 'text', id: 'share-url-input', readonly: 'true', class: 'share-url-input' });
    urlInput.addEventListener('click', () => { urlInput.select(); });
    const copyBtn = makeEl('button', { type: 'button', class: 'btn btn-secondary btn-sm', id: 'share-copy-btn' }, 'Copy');
    copyBtn.addEventListener('click', () => {
      urlInput.select();
      try { document.execCommand('copy'); } catch (_) { navigator.clipboard && navigator.clipboard.writeText(urlInput.value); }
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
    urlRow.appendChild(urlInput);
    urlRow.appendChild(copyBtn);
    resultEl.appendChild(urlRow);
    body.appendChild(resultEl);

    modal.appendChild(body);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Close');
    cancel.addEventListener('click', () => { backdrop.classList.add('hidden'); });
    const create = makeEl('button', { type: 'button', class: 'btn btn-primary', id: 'share-create-btn' }, 'Create Link');
    create.addEventListener('click', doCreateShare);
    footer.appendChild(cancel);
    footer.appendChild(create);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function buildLightbox() {
    const lb = makeEl('div', { class: 'lightbox hidden', id: 'files-lightbox' });
    const closeBtn = makeEl('button', { type: 'button', class: 'lightbox-close', 'aria-label': 'Close' }, '×');
    closeBtn.addEventListener('click', () => lb.classList.add('hidden'));
    const img = makeEl('img', { class: 'lightbox-img', id: 'lightbox-img', src: '', alt: '' });
    lb.appendChild(closeBtn);
    lb.appendChild(img);
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.classList.add('hidden'); });
    return lb;
  }

  function buildMediaModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-media' });
    const modal = makeEl('div', { class: 'modal modal-wide media-modal' });

    const header = makeEl('div', { class: 'modal-header' });
    const h3 = makeEl('h3', { id: 'media-modal-title' });
    const closeBtn = makeEl('button', { type: 'button', class: 'btn btn-ghost btn-sm media-modal-close' }, '×');
    closeBtn.addEventListener('click', () => { closeMediaModal(); });
    header.appendChild(h3);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body media-modal-body', id: 'media-modal-body' });
    modal.appendChild(body);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeMediaModal(); });
    return backdrop;
  }

  function closeMediaModal() {
    const backdrop = document.getElementById('modal-media');
    if (!backdrop) return;
    const body = document.getElementById('media-modal-body');
    if (body) {
      const video = body.querySelector('video');
      if (video) { video.pause(); video.src = ''; }
      const audio = body.querySelector('audio');
      if (audio) { audio.pause(); audio.src = ''; }
      body.innerHTML = '';
    }
    backdrop.classList.add('hidden');
  }

  function buildNewFolderModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-newfolder' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header' });
    header.appendChild(makeEl('h3', {}, 'New Folder'));
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body' });
    const fg = makeEl('div', { class: 'form-group' });
    fg.appendChild(makeEl('label', { for: 'newfolder-name' }, 'Folder name'));
    fg.appendChild(makeEl('input', { type: 'text', id: 'newfolder-name', placeholder: 'my-folder' }));
    body.appendChild(fg);
    modal.appendChild(body);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const create = makeEl('button', { type: 'button', class: 'btn btn-primary' }, 'Create');
    create.addEventListener('click', doNewFolder);
    footer.appendChild(cancel);
    footer.appendChild(create);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function buildRenameModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-rename' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header' });
    header.appendChild(makeEl('h3', {}, 'Rename'));
    modal.appendChild(header);

    const body = makeEl('div', { class: 'modal-body' });
    const fg = makeEl('div', { class: 'form-group' });
    fg.appendChild(makeEl('label', { for: 'rename-name' }, 'New name'));
    fg.appendChild(makeEl('input', { type: 'text', id: 'rename-name' }));
    body.appendChild(fg);
    modal.appendChild(body);

    const footer = makeEl('div', { class: 'modal-footer' });
    const cancel = makeEl('button', { type: 'button', class: 'btn btn-secondary' }, 'Cancel');
    cancel.addEventListener('click', () => backdrop.classList.add('hidden'));
    const save = makeEl('button', { type: 'button', class: 'btn btn-primary' }, 'Rename');
    save.addEventListener('click', doRename);
    footer.appendChild(cancel);
    footer.appendChild(save);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.add('hidden'); });
    return backdrop;
  }

  function buildDeleteModal() {
    const backdrop = makeEl('div', { class: 'modal-backdrop hidden', id: 'modal-delete-file' });
    const modal = makeEl('div', { class: 'modal' });

    const header = makeEl('div', { class: 'modal-header', style: { textAlign: 'center' } });
    const icon = makeEl('div', { class: 'modal-confirm-icon' });
    icon.appendChild(makeSvg('<polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/>'));
    header.appendChild(icon);
    header.appendChild(makeEl('h3', {}, 'Delete'));
    const sub = makeEl('p', { id: 'delete-file-msg' });
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

  let renameTarget = null;
  let deleteTarget = null;

  function showNewFolderModal() {
    const input = document.getElementById('newfolder-name');
    if (input) { input.value = ''; }
    document.getElementById('modal-newfolder').classList.remove('hidden');
    if (input) input.focus();
  }

  function showRenameModal(entry) {
    renameTarget = entry;
    const input = document.getElementById('rename-name');
    if (input) input.value = entry.name;
    document.getElementById('modal-rename').classList.remove('hidden');
    if (input) { input.focus(); input.select(); }
  }

  function showDeleteModal(entry) {
    deleteTarget = entry;
    const msg = document.getElementById('delete-file-msg');
    if (msg) msg.textContent = 'Delete "' + entry.name + '"? This cannot be undone.';
    document.getElementById('modal-delete-file').classList.remove('hidden');
  }

  async function doNewFolder() {
    const input = document.getElementById('newfolder-name');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    try {
      await api.post('/api/files/mkdir', { path: joinPath(currentPath, name) });
      document.getElementById('modal-newfolder').classList.add('hidden');
      showToast('Created', name, 'success');
      loadDir(currentPath);
    } catch (_) {}
  }

  async function doRename() {
    if (!renameTarget) return;
    const input = document.getElementById('rename-name');
    const newName = input ? input.value.trim() : '';
    if (!newName || newName === renameTarget.name) return;
    try {
      await api.put('/api/files/rename', {
        oldPath: joinPath(currentPath, renameTarget.name),
        newPath: joinPath(currentPath, newName),
      });
      document.getElementById('modal-rename').classList.add('hidden');
      showToast('Renamed', newName, 'success');
      loadDir(currentPath);
    } catch (_) {}
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api.del('/api/files?path=' + encodeURIComponent(joinPath(currentPath, deleteTarget.name)));
      document.getElementById('modal-delete-file').classList.add('hidden');
      showToast('Deleted', deleteTarget.name, 'success');
      loadDir(currentPath);
    } catch (_) {}
  }

  function downloadFile(entry) {
    const path = joinPath(currentPath, entry.name);
    api.download('/api/files/download?path=' + encodeURIComponent(path), entry.name);
  }

  function openFile(entry) {
    const path = joinPath(currentPath, entry.name);
    const name = entry.name;

    if (isImage(name)) {
      const lb = document.getElementById('files-lightbox');
      const img = document.getElementById('lightbox-img');
      if (lb && img) {
        img.src = '/api/files/preview?path=' + encodeURIComponent(path);
        img.alt = name;
        lb.classList.remove('hidden');
      }
      return;
    }

    if (isVideo(name)) {
      const title = document.getElementById('media-modal-title');
      const body = document.getElementById('media-modal-body');
      if (title) title.textContent = name;
      if (body) {
        body.innerHTML = '';
        const video = makeEl('video', { controls: 'true', class: 'media-player' });
        video.setAttribute('src', '/api/files/stream?path=' + encodeURIComponent(path));
        body.appendChild(video);
      }
      const backdrop = document.getElementById('modal-media');
      if (backdrop) backdrop.classList.remove('hidden');
      return;
    }

    if (isAudio(name)) {
      const title = document.getElementById('media-modal-title');
      const body = document.getElementById('media-modal-body');
      if (title) title.textContent = name;
      if (body) {
        body.innerHTML = '';
        const label = makeEl('div', { class: 'media-audio-label' }, name);
        const audio = makeEl('audio', { controls: 'true', class: 'media-player media-audio' });
        audio.setAttribute('src', '/api/files/stream?path=' + encodeURIComponent(path));
        body.appendChild(label);
        body.appendChild(audio);
      }
      const backdrop = document.getElementById('modal-media');
      if (backdrop) backdrop.classList.remove('hidden');
      return;
    }

    downloadFile(entry);
  }

  let shareTarget = null;

  function showShareModal(entry) {
    shareTarget = entry;
    const sub = document.getElementById('share-modal-filename');
    if (sub) sub.textContent = entry.name;
    const result = document.getElementById('share-result');
    if (result) result.classList.add('hidden');
    const createBtn = document.getElementById('share-create-btn');
    if (createBtn) { createBtn.textContent = 'Create Link'; createBtn.disabled = false; }
    const urlInput = document.getElementById('share-url-input');
    if (urlInput) urlInput.value = '';
    document.getElementById('modal-share').classList.remove('hidden');
  }

  async function doCreateShare() {
    if (!shareTarget) return;
    const path = joinPath(currentPath, shareTarget.name);
    const expiresIn = parseInt(document.getElementById('share-expires').value, 10);
    const maxDownloads = parseInt(document.getElementById('share-maxdl').value, 10);

    const createBtn = document.getElementById('share-create-btn');
    if (createBtn) { createBtn.disabled = true; createBtn.textContent = 'Creating…'; }

    try {
      const res = await api.post('/api/files/share', { path, expiresIn, maxDownloads });
      const url = res.url || (window.location.origin + '/share/' + res.token);
      const urlInput = document.getElementById('share-url-input');
      if (urlInput) { urlInput.value = url; setTimeout(() => { urlInput.select(); }, 50); }
      const result = document.getElementById('share-result');
      if (result) result.classList.remove('hidden');
      if (createBtn) { createBtn.textContent = 'Create Another'; createBtn.disabled = false; }
      showToast('Share link created', shareTarget.name, 'success');
    } catch (_) {
      if (createBtn) { createBtn.textContent = 'Create Link'; createBtn.disabled = false; }
    }
  }

  function navigate(path) {
    currentPath = path;
    renderBreadcrumb();
    loadDir(path);
  }

  async function loadDir(path) {
    const tbody = document.getElementById('files-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const tr = makeEl('tr', { class: 'loading-row' });
      const td = makeEl('td', { colspan: '4' });
      td.appendChild(makeEl('div', { class: 'spinner', style: { margin: '0 auto' } }));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    try {
      const data = await api.get('/api/files?path=' + encodeURIComponent(path));
      entries = Array.isArray(data) ? data : (data.entries || data.files || []);
      renderTable();
    } catch (_) {
      if (tbody) {
        tbody.innerHTML = '';
        const tr = makeEl('tr');
        const td = makeEl('td', { colspan: '4', class: 'error-state' }, 'Failed to load directory');
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }
  }

  function joinPath(base, name) {
    const b = base.endsWith('/') ? base : base + '/';
    return b + name;
  }

  function init() {
    loadDir(currentPath);
  }

  function destroy() {}

  return { render, init, destroy };
})());
