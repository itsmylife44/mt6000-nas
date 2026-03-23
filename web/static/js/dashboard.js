registerView('dashboard', (() => {
  let refreshTimer = null;

  function render(container) {
    container.appendChild(buildShell());
  }

  function buildShell() {
    const wrap = makeEl('div', {});

    const header = makeEl('div', { class: 'page-header' });
    const titleBlock = makeEl('div', {});
    titleBlock.appendChild(makeEl('h1', { class: 'page-title' }, 'Dashboard'));
    const sub = makeEl('div', { class: 'page-subtitle' }, 'System overview');
    titleBlock.appendChild(sub);
    header.appendChild(titleBlock);
    wrap.appendChild(header);

    const grid = makeEl('div', { class: 'dash-grid', id: 'dash-grid' });
    grid.appendChild(buildCard('dash-sysinfo', 'System Info', sysInfoSvg()));
    grid.appendChild(buildCard('dash-cpu', 'CPU Usage', cpuSvg()));
    grid.appendChild(buildCard('dash-mem', 'Memory', memSvg()));
    grid.appendChild(buildCard('dash-disk', 'Disk Usage', diskSvg()));
    grid.appendChild(buildCard('dash-net', 'Network', netSvg()));
    grid.appendChild(buildCard('dash-samba', 'Samba', sambaSvg()));
    wrap.appendChild(grid);

    return wrap;
  }

  function buildCard(id, title, iconSvg) {
    const card = makeEl('div', { class: 'card', id: id });
    const hdr = makeEl('div', { class: 'card-header' });
    const titleEl = makeEl('div', { class: 'card-title' });
    iconSvg.style.width = '14px';
    iconSvg.style.height = '14px';
    titleEl.appendChild(iconSvg);
    titleEl.appendChild(document.createTextNode(title));
    hdr.appendChild(titleEl);
    card.appendChild(hdr);
    const body = makeEl('div', { id: id + '-body' });
    body.appendChild(buildSpinnerRow());
    card.appendChild(body);
    return card;
  }

  function buildSpinnerRow() {
    const wrap = makeEl('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '0.85rem' } });
    wrap.appendChild(makeEl('div', { class: 'spinner' }));
    wrap.appendChild(document.createTextNode('Loading…'));
    return wrap;
  }

  function setCardBody(id, content) {
    const el = document.getElementById(id + '-body');
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(content);
  }

  function setCardError(id, msg) {
    const el = document.getElementById(id + '-body');
    if (!el) return;
    el.innerHTML = '';
    const e = makeEl('div', { class: 'error-state' });
    e.textContent = msg || 'Failed to load';
    el.appendChild(e);
  }

  async function fetchAll() {
    await Promise.allSettled([
      fetchSysInfo(),
      fetchDisk(),
      fetchNet(),
      fetchSamba(),
    ]);
  }

  async function fetchSysInfo() {
    try {
      const data = await api.get('/api/system/info');
      renderSysInfo(data);
      renderCpu(data);
      renderMem(data);
    } catch (_) {
      setCardError('dash-sysinfo');
      setCardError('dash-cpu');
      setCardError('dash-mem');
    }
  }

  async function fetchDisk() {
    try {
      const data = await api.get('/api/system/disk');
      renderDisk(data);
    } catch (_) {
      setCardError('dash-disk');
    }
  }

  async function fetchNet() {
    try {
      const data = await api.get('/api/system/network');
      renderNet(data);
    } catch (_) {
      setCardError('dash-net');
    }
  }

  async function fetchSamba() {
    try {
      const data = await api.get('/api/samba/status');
      renderSambaStatus(data);
    } catch (_) {
      setCardError('dash-samba');
    }
  }

  function renderSysInfo(data) {
    const frag = document.createDocumentFragment();
    const rows = [
      ['Hostname', data.hostname],
      ['Kernel',   data.kernelVersion],
      ['Uptime',   formatUptime(data.uptimeSeconds)],
    ];
    rows.forEach(([key, val]) => {
      if (!val) return;
      const row = makeEl('div', { class: 'info-row' });
      row.appendChild(makeEl('span', { class: 'info-key' }, key));
      row.appendChild(makeEl('span', { class: 'info-val' }, String(val)));
      frag.appendChild(row);
    });
    setCardBody('dash-sysinfo', frag);
  }

  function renderCpu(data) {
    const usage = data.cpuUsagePercent;
    if (usage == null) { setCardError('dash-cpu', 'No data'); return; }
    const pct = Math.round(usage);
    const frag = document.createDocumentFragment();

    const val = makeEl('div', { class: 'card-value' });
    val.appendChild(document.createTextNode(pct));
    const unit = makeEl('span', { class: 'card-value-unit' }, '%');
    val.appendChild(unit);
    frag.appendChild(val);

    const bar = makeEl('div', { class: 'progress-bar' });
    const fill = makeEl('div', { class: 'progress-fill' + (pct > 85 ? ' danger' : pct > 60 ? ' warn' : '') });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    frag.appendChild(bar);

    setCardBody('dash-cpu', frag);
  }

  function renderMem(data) {
    const total = data.memTotalBytes;
    const used  = data.memUsedBytes;
    if (!total) { setCardError('dash-mem', 'No data'); return; }

    const pct = Math.round((used / total) * 100);
    const frag = document.createDocumentFragment();

    const val = makeEl('div', { class: 'card-value' });
    val.appendChild(document.createTextNode(formatBytes(used)));
    frag.appendChild(val);

    const rowUsed = makeEl('div', { class: 'stat-row' });
    rowUsed.appendChild(makeEl('span', { class: 'stat-label' }, 'Used'));
    rowUsed.appendChild(makeEl('span', {}, formatBytes(used) + ' / ' + formatBytes(total)));
    frag.appendChild(rowUsed);

    const rowFree = makeEl('div', { class: 'stat-row' });
    rowFree.appendChild(makeEl('span', { class: 'stat-label' }, 'Free'));
    rowFree.appendChild(makeEl('span', {}, formatBytes(total - used)));
    frag.appendChild(rowFree);

    const bar = makeEl('div', { class: 'progress-bar' });
    const fill = makeEl('div', { class: 'progress-fill' + (pct > 85 ? ' danger' : pct > 60 ? ' warn' : '') });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    frag.appendChild(bar);

    const pctLabel = makeEl('div', { class: 'stat-row', style: { marginTop: '6px' } });
    pctLabel.appendChild(makeEl('span', { class: 'stat-label' }, 'Usage'));
    pctLabel.appendChild(makeEl('span', {}, pct + '%'));
    frag.appendChild(pctLabel);

    setCardBody('dash-mem', frag);
  }

  function renderDisk(data) {
    const disks = Array.isArray(data) ? data : (data.disks || [data]);
    if (!disks.length) { setCardError('dash-disk', 'No disks found'); return; }

    const frag = document.createDocumentFragment();
    disks.forEach(d => {
      const total = d.totalBytes;
      const used  = d.usedBytes;
      const free  = d.freeBytes;
      const pct   = total ? Math.round((used / total) * 100) : 0;

      const section = makeEl('div', { style: { marginBottom: '14px' } });
      const nameRow = makeEl('div', { class: 'stat-row' });
      nameRow.appendChild(makeEl('span', { style: { fontWeight: '600', color: 'var(--text-primary)' } }, d.path || '/'));
      if (d.filesystemType) nameRow.appendChild(makeEl('span', { class: 'stat-label' }, d.filesystemType));
      section.appendChild(nameRow);

      const usedRow = makeEl('div', { class: 'stat-row' });
      usedRow.appendChild(makeEl('span', { class: 'stat-label' }, 'Used'));
      usedRow.appendChild(makeEl('span', {}, formatBytes(used) + ' / ' + formatBytes(total)));
      section.appendChild(usedRow);

      if (free != null) {
        const freeRow = makeEl('div', { class: 'stat-row' });
        freeRow.appendChild(makeEl('span', { class: 'stat-label' }, 'Free'));
        freeRow.appendChild(makeEl('span', {}, formatBytes(free)));
        section.appendChild(freeRow);
      }

      const bar = makeEl('div', { class: 'progress-bar' });
      const fill = makeEl('div', { class: 'progress-fill' + (pct > 90 ? ' danger' : pct > 70 ? ' warn' : '') });
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      section.appendChild(bar);

      const pctRow = makeEl('div', { class: 'stat-row', style: { marginTop: '5px' } });
      pctRow.appendChild(makeEl('span', { class: 'stat-label' }, 'Usage'));
      pctRow.appendChild(makeEl('span', {}, pct + '%'));
      section.appendChild(pctRow);

      frag.appendChild(section);
    });
    setCardBody('dash-disk', frag);
  }

  function renderNet(data) {
    const ifaces = Array.isArray(data) ? data : (data.interfaces || []);
    if (!ifaces.length) { setCardError('dash-net', 'No interfaces'); return; }

    const frag = document.createDocumentFragment();
    ifaces.forEach(iface => {
      const row = makeEl('div', { class: 'net-interface' });
      const left = makeEl('div', {});
      const name = makeEl('div', { class: 'net-iface-name' }, iface.name || '?');
      left.appendChild(name);
      const ips = iface.ipAddrs || [];
      if (ips.length) {
        left.appendChild(makeEl('div', { class: 'net-iface-ip' }, ips.join(', ')));
      }
      row.appendChild(left);

      const right = makeEl('div', { class: 'net-stats' });
      if (iface.rxBytes != null) {
        const rx = makeEl('div', { class: 'net-stat-row' });
        rx.appendChild(makeSvg('<polyline points="17,1 21,5 17,9"/><path d="M3 11V9a4 4 0 014-4h14"/>', { cls: 'file-icon' }));
        rx.appendChild(document.createTextNode(formatBytes(iface.rxBytes)));
        right.appendChild(rx);
      }
      if (iface.txBytes != null) {
        const tx = makeEl('div', { class: 'net-stat-row' });
        tx.appendChild(makeSvg('<polyline points="7,23 3,19 7,15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>', { cls: 'file-icon' }));
        tx.appendChild(document.createTextNode(formatBytes(iface.txBytes)));
        right.appendChild(tx);
      }
      row.appendChild(right);
      frag.appendChild(row);
    });
    setCardBody('dash-net', frag);
  }

  function renderSambaStatus(data) {
    const running = data.running || data.status === 'running';
    const clients = data.clients || data.connected_clients || 0;

    const frag = document.createDocumentFragment();
    const statusRow = makeEl('div', { class: 'stat-row', style: { marginBottom: '10px' } });
    statusRow.appendChild(makeEl('span', { class: 'stat-label' }, 'Status'));
    const badge = makeEl('span', { class: 'badge ' + (running ? 'badge-success' : 'badge-danger') });
    badge.textContent = running ? 'Running' : 'Stopped';
    statusRow.appendChild(badge);
    frag.appendChild(statusRow);

    const clientRow = makeEl('div', { class: 'stat-row' });
    clientRow.appendChild(makeEl('span', { class: 'stat-label' }, 'Connected clients'));
    clientRow.appendChild(makeEl('span', {}, String(clients)));
    frag.appendChild(clientRow);

    setCardBody('dash-samba', frag);
  }

  function formatUptime(seconds) {
    if (!seconds) return '—';
    const s = parseInt(seconds, 10);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const parts = [];
    if (d) parts.push(d + 'd');
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    return parts.join(' ') || '<1m';
  }

  function init() {
    fetchAll();
    refreshTimer = setInterval(fetchAll, 5000);
  }

  function destroy() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function sysInfoSvg() { return makeSvg('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'); }
  function cpuSvg()     { return makeSvg('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="14" x2="22" y2="14"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="14" x2="4" y2="14"/>'); }
  function memSvg()     { return makeSvg('<path d="M6 19V5a2 2 0 012-2h8a2 2 0 012 2v14"/><path d="M4 19h16"/><path d="M10 11h4"/>'); }
  function diskSvg()    { return makeSvg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'); }
  function netSvg()     { return makeSvg('<path d="M5 12.55a11 11 0 0114.08 0"/><path d="M1.42 9a16 16 0 0121.16 0"/><path d="M8.53 16.11a6 6 0 016.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>'); }
  function sambaSvg()   { return makeSvg('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/>'); }

  return { render, init, destroy };
})());
