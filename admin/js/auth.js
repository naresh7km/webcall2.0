window.Auth = (function() {
  const API = () => window.WEBCALL_CONFIG.API_URL;
  const STORAGE_KEY = 'webcall_auth';

  function getStored() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  function store(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getAccessToken() {
    const data = getStored();
    return data ? data.accessToken : null;
  }

  function getAgent() {
    const data = getStored();
    return data ? data.agent : null;
  }

  function isLoggedIn() {
    return !!getAccessToken();
  }

  async function login(email, password) {
    const res = await fetch(`${API()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }

    const data = await res.json();
    store(data);
    return data;
  }

  async function refreshToken() {
    const data = getStored();
    if (!data || !data.refreshToken) {
      clear();
      return null;
    }

    try {
      const res = await fetch(`${API()}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: data.refreshToken }),
      });

      if (!res.ok) {
        clear();
        return null;
      }

      const newData = await res.json();
      store(newData);
      return newData;
    } catch {
      clear();
      return null;
    }
  }

  async function logout() {
    const data = getStored();
    if (data && data.refreshToken) {
      try {
        await fetch(`${API()}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: data.refreshToken }),
        });
      } catch { /* ignore */ }
    }
    clear();
  }

  // Auto-refresh before expiry
  async function fetchWithAuth(url, options = {}) {
    let token = getAccessToken();
    if (!token) throw new Error('Not authenticated');

    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    let res = await fetch(url, options);

    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (!refreshed) throw new Error('Session expired');

      options.headers['Authorization'] = `Bearer ${refreshed.accessToken}`;
      res = await fetch(url, options);
    }

    return res;
  }

  return { login, logout, refreshToken, getAccessToken, getAgent, isLoggedIn, clear, fetchWithAuth, API };
})();
