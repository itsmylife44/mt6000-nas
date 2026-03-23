const state = {
  user: null,
  currentView: null,
};

const views = {};

function registerView(name, mod) {
  views[name] = mod;
}

const router = (() => {
  function getHash() {
    const h = window.location.hash.slice(1) || '/dashboard';
    return h.split('?')[0];
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function route() {
    const path = getHash();
    const name = path.replace('/', '').split('/')[0] || 'dashboard';
    loadView(name);
  }

  return { navigate, route, getHash };
})();

function loadView(name) {
  const valid = ['dashboard', 'files', 'samba', 'users', 'logs', 'shares', 'backups'];
  const target = valid.includes(name) ? name : 'dashboard';

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === target);
  });

  if (state.currentView && views[state.currentView] && views[state.currentView].destroy) {
    views[state.currentView].destroy();
  }

  state.currentView = target;
  const container = document.getElementById('app');
  container.innerHTML = '';

  if (views[target]) {
    views[target].render(container);
    if (views[target].init) views[target].init();
  } else {
    container.textContent = 'View not found.';
  }
}

function showToast(title, message, type) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast toast-' + (type || 'info');

  const icon = makeToastIcon(type);
  const content = document.createElement('div');
  content.className = 'toast-content';

  const t = document.createElement('div');
  t.className = 'toast-title';
  t.textContent = title;

  const m = document.createElement('div');
  m.className = 'toast-msg';
  m.textContent = message || '';

  content.appendChild(t);
  if (message) content.appendChild(m);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.textContent = '×';
  close.addEventListener('click', () => dismissToast(el));

  el.appendChild(icon);
  el.appendChild(content);
  el.appendChild(close);
  container.appendChild(el);

  setTimeout(() => dismissToast(el), 5000);
}

function makeToastIcon(type) {
  const el = document.createElement('div');
  el.className = 'toast-icon';

  const paths = {
    success: '<polyline points="20,6 9,17 4,12"/>',
    error:   '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.style.width = '16px';
  svg.style.height = '16px';
  svg.innerHTML = paths[type] || paths.info;
  el.appendChild(svg);
  return el;
}

function dismissToast(el) {
  if (!el.parentNode) return;
  el.classList.add('removing');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function showLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
}

function setupLogin() {
  const form = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    errEl.textContent = '';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    btnSpinner.classList.remove('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        errEl.textContent = body.error || body.message || 'Invalid credentials';
        errEl.classList.remove('hidden');
        return;
      }

      state.user = body.user || body || { username };
      document.getElementById('username-display').textContent = state.user.username || username;
      hideLoginModal();
      window.addEventListener('hashchange', router.route);
      router.route();
    } catch (e) {
      errEl.textContent = 'Network error';
      errEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      btnText.classList.remove('hidden');
      btnSpinner.classList.add('hidden');
    }
  });
}

function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api.post('/api/auth/logout', {}); } catch (_) {}
    state.user = null;
    showLoginModal();
  });
}

function setupSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });
  });
}

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(#login-modal):not(.hidden)').forEach(m => {
        m.classList.add('hidden');
      });
    }
  });
}

async function init() {
  setupLogin();
  setupLogout();
  setupSidebar();
  setupKeyboard();

  onUnauthorized = () => {
    state.user = null;
    showLoginModal();
  };

  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      state.user = body.user || body;
      document.getElementById('username-display').textContent =
        (state.user && state.user.username) || 'admin';
      hideLoginModal();
      window.addEventListener('hashchange', router.route);
      router.route();
    } else {
      showLoginModal();
    }
  } catch (e) {
    showLoginModal();
  }
}

document.addEventListener('DOMContentLoaded', init);

function makeEl(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else el.setAttribute(k, v);
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    });
  }
  return el;
}

function makeSvg(paths, opts) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', opts && opts.filled ? '0' : '2');
  if (opts && opts.cls) svg.setAttribute('class', opts.cls);
  svg.innerHTML = paths;
  return svg;
}

function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  return (bytes / Math.pow(1024, idx)).toFixed(idx > 0 ? 1 : 0) + ' ' + units[idx];
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function createModal(id, title, bodyHTML, footerBtns, opts) {
  let existing = document.getElementById(id);
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop hidden';
  backdrop.id = id;

  const modal = document.createElement('div');
  modal.className = 'modal' + (opts && opts.wide ? ' modal-wide' : '');

  const header = document.createElement('div');
  header.className = 'modal-header';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  header.appendChild(h3);
  if (opts && opts.subtitle) {
    const p = document.createElement('p');
    p.textContent = opts.subtitle;
    header.appendChild(p);
  }

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.innerHTML = bodyHTML;

  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footerBtns.forEach(btn => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (btn.cls || 'btn-secondary');
    b.textContent = btn.label;
    b.addEventListener('click', btn.action);
    footer.appendChild(b);
  });

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.add('hidden');
  });

  return backdrop;
}
