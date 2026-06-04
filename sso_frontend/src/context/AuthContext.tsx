import { createContext, useContext, useState, type ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name?: string;
  avatar_url?: string;
}

export interface Module {
  code: string;
  name: string;
  description: string;
  redirect_url: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  modules: Module[];
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

  const login = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('sso_token', authToken);
    localStorage.setItem('sso_user', JSON.stringify(userData));
  };

  const setModules = (newModules: Module[]) => {
    setModulesState(newModules);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setModulesState([]);
    localStorage.removeItem('sso_token');
    localStorage.removeItem('sso_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        modules,
        login,
        setModules,
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
