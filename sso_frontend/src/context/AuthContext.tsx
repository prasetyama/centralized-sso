import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { fetchUserModules } from '../api/api';

export interface User {
  id: string;
  email: string;
  name: string;
  department: string;
  role: string;
  image?: string;
}

export interface Module {
  module: string;
  operator: string;
  redirect_url: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  modules: Module[];
  loadingData: boolean;
  errorData: string;
  login: (userData: User, authToken: string) => void;
  setModules: (modules: Module[]) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('sso_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sso_token'));
  const [modules, setModulesState] = useState<Module[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorData, setErrorData] = useState<string>('');

  const queryParams = new URLSearchParams(location.search);
  const redirectUrl = queryParams.get('redirect_url');

  const logout = () => {
    setUser(null);
    setToken(null);
    setModulesState([]);
    localStorage.removeItem('sso_token');
    localStorage.removeItem('sso_user');
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        setLoadingData(false);
        return;
      }

      setLoadingData(true);
      setErrorData('');

      try {
        const modulesResponse = await fetchUserModules(token);
        const fetchedModules = modulesResponse.data.modules || [];
        setModulesState(fetchedModules);

        if (redirectUrl) {
          const isAuthorized = fetchedModules.some(
            (mod: Module) => mod.redirect_url && redirectUrl.startsWith(mod.redirect_url)
          );
          if (isAuthorized) {
            const separator = redirectUrl.includes('?') ? '&' : '?';
            window.location.href = `${redirectUrl}${separator}token=${token}`;
            return;
          }
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message;
        if (errorMsg === 'Token has expired' || err.response?.status === 401) {
          logout();
          window.location.href = '/login';
        } else {
          setErrorData('Failed to load data.');
        }
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [token]);

  const login = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('sso_token', authToken);
    localStorage.setItem('sso_user', JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        modules,
        loadingData,
        errorData,
        login,
        setModules: setModulesState,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
