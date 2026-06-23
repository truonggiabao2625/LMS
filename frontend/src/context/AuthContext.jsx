import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const AuthContext = createContext();
const envApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const API_URL = envApiUrl.endsWith('/api') ? envApiUrl.slice(0, -4) : envApiUrl;

axios.defaults.baseURL = API_URL;
axios.defaults.withCredentials = true;

// Khởi tạo Authorization header ngay lập tức nếu có token trong localStorage
const initialToken = localStorage.getItem('token');
if (initialToken) {
  axios.defaults.headers.common.Authorization = `Bearer ${initialToken}`;
}

const normalizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar ?? null,
    phone: user.phone ?? null,
    bio: user.bio ?? null,
    settings: user.settings ?? null,
    walletBalance: user.walletBalance ?? 0,
    totalSpent: user.totalSpent ?? 0,
    memberTier: user.memberTier ?? 'BRONZE',
    memberTierLabel: user.memberTierLabel,
    rewardPoints: user.rewardPoints ?? 0,
    loginStreak: user.loginStreak ?? 0,
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    try {
      return normalizeUser(savedUser ? JSON.parse(savedUser) : null);
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  });

  const persistUser = useCallback((nextUser) => {
    const normalized = normalizeUser(nextUser);
    setUser(normalized);

    if (normalized) {
      localStorage.setItem('user', JSON.stringify(normalized));
    } else {
      localStorage.removeItem('user');
    }

    return normalized;
  }, []);

  const logout = useCallback((reason) => {
    axios.post('/api/auth/logout').catch(() => null);
    persistUser(null);
    localStorage.removeItem('token');
    sessionStorage.removeItem('skillio_student_preview');
    delete axios.defaults.headers.common.Authorization;
    delete axios.defaults.headers.common['X-Student-Preview'];

    if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = reason ? `/login?reason=${reason}` : '/login';
    }
  }, [persistUser]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await axios.get('/api/user/me');
      return persistUser(response.data);
    } catch {
      return null;
    }
  }, [persistUser]);

  const login = useCallback(async (email, password) => {
    const response = await axios.post('/api/auth/login', { email, password });
    const { user: userData, token } = response.data;

    localStorage.setItem('token', token);
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    return persistUser(userData);
  }, [persistUser]);

  const register = useCallback(async (name, email, password) => {
    const response = await axios.post('/api/auth/register', { name, email, password });
    const { user: userData, token } = response.data;

    localStorage.setItem('token', token);
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    return persistUser(userData);
  }, [persistUser]);

  const startSocialLogin = useCallback(async (provider) => {
    const normalizedProvider = provider.toLowerCase();
    const response = await axios.get('/api/auth/providers');
    if (!response.data?.[normalizedProvider]) {
      throw new Error(`Đăng nhập ${provider} chưa được cấu hình. Vui lòng thêm Client ID và Client Secret.`);
    }
    window.location.href = `${API_URL}/api/auth/social/${normalizedProvider}`;
  }, []);

  const completeSocialLogin = useCallback(async (token) => {
    if (token) {
      localStorage.setItem('token', token);
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    }
    const response = await axios.get('/api/user/me');
    return persistUser(response.data);
  }, [persistUser]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    let refreshTimer;
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      refreshTimer = window.setTimeout(() => {
        refreshUser().catch(() => null);
      }, 0);
    }

    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const wasLoggedIn = Boolean(localStorage.getItem('token'));
          logout(wasLoggedIn ? 'kickout' : null);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      axios.interceptors.response.eject(interceptor);
    };
  }, [logout, refreshUser]);

  const token = localStorage.getItem('token');

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      register,
      startSocialLogin,
      completeSocialLogin,
      logout,
      refreshUser,
    }),
    [user, token, login, register, startSocialLogin, completeSocialLogin, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
