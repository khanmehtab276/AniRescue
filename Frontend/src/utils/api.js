import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
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
