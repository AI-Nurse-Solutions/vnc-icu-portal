import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // On 401, redirect to login ONLY for non-auth-check requests
    // (auth/me returns 401 normally when not logged in — don't redirect for that)
    if (
      err.response?.status === 401 &&
      !err.config?.url?.includes('/auth/me')
    ) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
