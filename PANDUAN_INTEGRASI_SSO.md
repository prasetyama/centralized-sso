# Panduan Integrasi Centralized SSO (Single Sign-On) untuk Aplikasi Eksternal

Panduan ini berisi langkah-langkah praktis (step-by-step) bagi pengembang yang ingin mengintegrasikan aplikasi web/sistem baru dengan **Centralized SSO System**.

---

## 1. Prerequisites (Prasyarat Integrasi)

Sebelum memulai integrasi, pastikan langkah-langkah administratif berikut telah diselesaikan:

1. **Registrasi Kode Modul**:
   - Daftarkan kode modul baru Anda di database SSO Backend (tabel `stt__import_tables` / `ModuleMatrix` / `UserModuleRole`).
   - *Contoh*:
     - **Kode Modul**: `MYAPP`
     - **Nama Modul**: `My Custom Application`
     - **Redirect URL**: `https://myapp.ceresnl.com`

---

## 2. Step 1: Konfigurasi Environment Variables

Tambahkan URL SSO di file `.env` aplikasi Anda:

```env
# URL Frontend SSO (Tempat Login)
VITE_SSO_URL=https://account.ceresnl.com

# URL Backend SSO API
VITE_SSO_BACKEND_URL=https://account.ceresnl.com/api/v1
```

---

## 3. Step 2: Helper Fungsi Utility Cookie & Redirect

Buat helper untuk menangani penulisan & pembacaan Cookie serta redirect ke SSO:

```typescript
// utils/sso.ts

export const getCookieDomain = (): string => {
  return window.location.hostname.includes('ceresnl.com')
    ? '.ceresnl.com'
    : window.location.hostname;
};

export const getCookie = (name: string): string | null => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  }
  return null;
};

export const removeCookie = (name: string): void => {
  const domain = getCookieDomain();
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;domain=${domain};path=/`;
};

export const redirectToSSOLogin = (): void => {
  const currentUrl = window.location.origin + window.location.pathname;
  window.location.href = `${import.meta.env.VITE_SSO_URL}/login?redirect_url=${encodeURIComponent(currentUrl)}`;
};

export const redirectToSSOLogout = (): void => {
  const currentUrl = window.location.origin + window.location.pathname;
  window.location.href = `${import.meta.env.VITE_SSO_URL}/logout?redirect_url=${encodeURIComponent(currentUrl)}`;
};
```

---

## 4. Step 3: Implementasi Authentication Context (AuthContext)

Di aplikasi Klien (React/TypeScript), buat `AuthContext` untuk memverifikasi token dan hak akses modul:

```tsx
// context/AuthContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCookie, removeCookie, redirectToSSOLogin, redirectToSSOLogout } from '../utils/sso';

export interface User {
  user_id: string;
  email: string;
  name: string;
}

export type ModuleRole = 'editor' | 'viewer' | 'admin';

interface AuthContextType {
  user: User | null;
  role: ModuleRole | null;
  isAuthenticated: boolean;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<ModuleRole | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Cek parameter 'token' di URL (jika di-redirect dari SSO)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      // Bersihkan query string dari URL agar tampilan tetap bersih
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // 2. Baca token dari cookie shared sso_token
    const token = getCookie('sso_token');

    if (token) {
      try {
        // Dekode payload JWT (Base64)
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));

        // Cek Expiration Time (exp)
        const currentTime = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < currentTime) {
          throw new Error('Token expired');
        }

        // Cek Hak Akses Modul Spesifik (misalnya 'MYAPP')
        if (!payload.module_access || !payload.module_access['MYAPP']) {
          throw new Error('Unauthorized: User tidak memiliki hak akses modul MYAPP');
        }

        // Ambil Peran/Role User untuk Modul Ini
        const userRole = (
          payload.module_roles?.['MYAPP'] ||
          payload.module_roles?.['myapp'] ||
          'viewer'
        ) as ModuleRole;

        setUser({
          user_id: payload.user_id,
          email: payload.email,
          name: payload.name,
        });
        setRole(userRole);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('SSO Validation Error:', error);
        removeCookie('sso_token');
        redirectToSSOLogin();
      }
    } else {
      redirectToSSOLogin();
    }

    setLoading(false);
  }, []);

  // 3. Polling cookie untuk mendeteksi Logout global dari aplikasi lain
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const token = getCookie('sso_token');
      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        redirectToSSOLogin();
      }
    }, 3000); // Cek setiap 3 detik

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const logout = () => {
    removeCookie('sso_token');
    removeCookie('sso_user');
    redirectToSSOLogout();
  };

  if (loading) {
    return <div>Loading session...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, role, isAuthenticated, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

---

## 5. Step 4: Menyelipkan Token pada Setiap Request API Client

Setiap kali aplikasi eksternal memanggil backend API miliknya sendiri atau SSO backend, sertakan header `Authorization: Bearer <sso_token>`:

```typescript
// api/client.ts
import axios from 'axios';
import { getCookie } from '../utils/sso';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = getCookie('sso_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
```

---

## 6. Step 5: Verifikasi Token di Backend Aplikasi Eksternal

Backend aplikasi eksternal (Python, Node.js, PHP, Go, Java, dll) harus memverifikasi JWT token yang dikirim di header `Authorization`.

### Contoh Verifikasi Backend (Python / Django / FastAPI):
```python
import jwt
import os

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

def verify_sso_token(token_string):
    try:
        payload = jwt.decode(token_string, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Pastikan user memiliki izin ke modul aplikasi Anda
        module_access = payload.get("module_access", {})
        if "MYAPP" not in module_access:
            raise PermissionError("User does not have access to MYAPP module")
            
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid SSO token")
```

---

## 7. Step 6: Single Sign-Out Synchronization (Logout Lintas Aplikasi)

Untuk memastikan saat user menekan Logout di SSO atau di modul lain, aplikasi ini ikut ter-logout secara langsung:

1. **Cookie Polling** (Telah diimplementasikan di `AuthContext` di atas):
   Aplikasi mengecek keberadaan `sso_token` secara berkala via `setInterval`. Jika cookie hilang, user langsung di-redirect ke SSO Login.
2. **BroadcastChannel (Browser Tab Sync)**:
   Mendengarkan event `logout_channel`:
   ```typescript
   useEffect(() => {
     const logoutChannel = new BroadcastChannel('logout_channel');
     logoutChannel.onmessage = (event) => {
       if (event.data === 'logout') {
         window.location.reload();
       }
     };
     return () => logoutChannel.close();
   }, []);
   ```

---

## 8. Summary Checklist Integrasi

- [ ] Registrasi Kode Modul (`MYAPP`) di SSO Backend Database.
- [ ] Tambahkan `VITE_SSO_URL` & `VITE_SSO_BACKEND_URL` di file `.env`.
- [ ] Implementasikan pembacaan `sso_token` dari Cookie / URL Params.
- [ ] Validasi hak akses modul (`payload.module_access['MYAPP']`) & perannya (`payload.module_roles['myapp']`).
- [ ] Tambahkan Auto-redirect ke `${VITE_SSO_URL}/login?redirect_url=...` jika tidak terautentikasi.
- [ ] Sertakan `Authorization: Bearer <sso_token>` pada setiap HTTP API Request.
- [ ] Verifikasi token JWT pada backend aplikasi eksternal.
- [ ] Pengujian Single Sign-On & Single Sign-Out.

---
