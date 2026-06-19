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
  role: string;
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

const getCookieDomain = () => {
  return window.location.hostname.includes('ceresnl.com') ? '.ceresnl.com' : window.location.hostname;
};

const setCookie = (name: string, value: string, days = 1) => {
  const domain = getCookieDomain();
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + date.toUTCString();
  document.cookie = name + "=" + encodeURIComponent(value) + ";" + expires + ";domain=" + domain + ";path=/;SameSite=Lax";
};

const getCookie = (name: string) => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for(let i=0;i < ca.length;i++) {
    let c = ca[i];
    while (c.charAt(0)==' ') c = c.substring(1,c.length);
    if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
  }
  return null;
};

const removeCookie = (name: string) => {
  const domain = getCookieDomain();
  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;domain=" + domain + ";path=/";
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = getCookie('sso_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => getCookie('sso_token'));
  const [modules, setModulesState] = useState<Module[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [errorData, setErrorData] = useState<string>('');

  const queryParams = new URLSearchParams(location.search);
  const redirectUrl = queryParams.get('redirect_url');

  const logout = () => {
    setUser(null);
    setToken(null);
    setModulesState([]);
    removeCookie('sso_token');
    removeCookie('sso_user');

    const logoutChannel = new BroadcastChannel('logout_channel');
    logoutChannel.postMessage('logout');
    logoutChannel.close();

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
    setCookie('sso_token', authToken, 1);
    setCookie('sso_user', JSON.stringify(userData), 1);
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
