import axios from 'axios';

function resolveApiBaseUrl() {
  const configuredUrl = String(import.meta.env.VITE_API_URL || '/api').trim();
  const normalizedUrl = configuredUrl.replace(/\/+$/, '');

  // The backend mounts all application routes under /api. Keep the
  // frontend resilient if a deployment environment provides only the
  // backend origin instead of the full API base path.
  if (/^https?:\/\//i.test(normalizedUrl)) {
    try {
      const url = new URL(normalizedUrl);

      if (!url.pathname || url.pathname === '/') {
        url.pathname = '/api';
      } else if (!url.pathname.replace(/\/+$/, '').endsWith('/api')) {
        url.pathname = `${url.pathname.replace(/\/+$/, '')}/api`;
      }

      return url.toString().replace(/\/+$/, '');
    } catch {
      // Fall back to the configured value if it is not a valid absolute URL.
    }
  }

  if (normalizedUrl === '') return '/api';
  return normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`;
}

const API = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const CSRF_STORAGE_KEY = 'anirescue_csrf';

export function setCsrfToken(token) {
  if (typeof sessionStorage === 'undefined') return;

  if (token) {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

export function getCsrfToken() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(CSRF_STORAGE_KEY);
}

export async function refreshCsrfToken() {
  const response = await API.get('/auth/csrf');
  const token = response.data?.csrfToken;

  if (!token) {
    throw new Error('Backend did not return a CSRF token.');
  }

  setCsrfToken(token);
  return token;
}

API.interceptors.request.use(
  (config) => {
    const method = String(config.method || 'get').toLowerCase();

    if (!['get', 'head', 'options'].includes(method)) {
      const csrfToken = getCsrfToken();

      if (csrfToken) {
        config.headers = config.headers || {};
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

export default API;
