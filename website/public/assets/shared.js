const boardShared = (() => {
  async function apiFetch(url, options = {}) {
    const {
      redirectOnUnauthorized = true,
      ...fetchOptions
    } = options;
    const headers = new Headers(options.headers || {});
    if (fetchOptions.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      credentials: 'same-origin',
      ...fetchOptions,
      headers
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;

    if (response.status === 401) {
      if (redirectOnUnauthorized) {
        window.location.href = '/login.html';
      }
      throw new Error(payload?.error || '登录状态已失效');
    }

    if (!response.ok) {
      throw new Error(payload?.error || `请求失败（${response.status}）`);
    }

    return payload;
  }

  function formatHours(value) {
    return `${Number(value || 0).toFixed(1)}h`;
  }

  function formatPercent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function createBadge(level) {
    const labels = {
      high: '高风险',
      medium: '中风险',
      low: '低风险'
    };
    return `<span class="badge badge-${level || 'low'}">${labels[level] || '提示'}</span>`;
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  return {
    apiFetch,
    createBadge,
    escapeHtml,
    formatHours,
    formatPercent,
    setText
  };
})();

window.boardShared = boardShared;
