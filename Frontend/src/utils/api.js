import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function getCookie(name) {
  if (typeof document === 'undefined') return null;

  const prefix = `${name}=`;
  const entry = document.cookie
    .split('; ')
    .find((value) => value.startsWith(prefix));

  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}

API.interceptors.request.use(
  (config) => {
    const csrfToken = getCookie('anirescue_csrf');

    if (
      csrfToken &&
      !['get', 'head', 'options'].includes(
        String(config.method || 'get').toLowerCase(),
      )
    ) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }


    return config;
  },
  (error) => Promise.reject(error),
);

export default API;
