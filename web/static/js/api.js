const api = (() => {
  async function request(method, url, data) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (data !== undefined) opts.body = JSON.stringify(data);

    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      showToast('Network error', e.message || 'Could not reach server', 'error');
      throw e;
    }

    if (res.status === 401) {
      if (typeof onUnauthorized === 'function') onUnauthorized();
      throw new Error('Unauthorized');
    }

    let body;
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    if (!res.ok) {
      const msg = (body && body.error) || (body && body.message) || res.statusText;
      showToast('Request failed', msg, 'error');
      throw new Error(msg);
    }

    return body;
  }

  function get(url) { return request('GET', url); }
  function post(url, data) { return request('POST', url, data); }
  function put(url, data) { return request('PUT', url, data); }
  function del(url) { return request('DELETE', url); }

  function upload(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status === 401) {
          if (typeof onUnauthorized === 'function') onUnauthorized();
          reject(new Error('Unauthorized'));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          let result;
          try { result = JSON.parse(xhr.responseText); } catch (e) { result = xhr.responseText; }
          resolve(result);
        } else {
          let msg;
          try {
            const b = JSON.parse(xhr.responseText);
            msg = b.error || b.message || xhr.statusText;
          } catch (e) { msg = xhr.statusText; }
          showToast('Upload failed', msg, 'error');
          reject(new Error(msg));
        }
      });

      xhr.addEventListener('error', () => {
        showToast('Network error', 'Upload failed', 'error');
        reject(new Error('Network error'));
      });

      xhr.open('POST', url);
      xhr.send(formData);
    });
  }

  async function download(url, filename) {
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showToast('Download failed', e.message, 'error');
      throw e;
    }
  }

  return { get, post, put, del, upload, download };
})();

let onUnauthorized = null;
