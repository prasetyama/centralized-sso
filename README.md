# Centralized SSO System

Sistem Single Sign-On (SSO) terpusat untuk mengelola autentikasi dan otorisasi pengguna di seluruh aplikasi internal (EORDER, HRM, dll). Dibangun dengan **Django REST Framework** (backend) dan **React + Vite** (frontend).

---

## Arsitektur Sistem

```mermaid
graph TB
    subgraph SSO["SSO Portal (sso.example.com)"]
        SF["SSO Frontend<br/>React + Vite"]
        SB["SSO Backend<br/>Django REST Framework"]
    end

    subgraph Clients["Client Applications"]
        EO["EORDER Client<br/>React + Vite"]
        HRM["HRM Client<br/>(future)"]
        OTHER["Other Modules..."]
    end

    subgraph External["External Services"]
        GOOGLE["Google OAuth 2.0"]
        DB["MySQL Database"]
    end

    SF -->|"API Calls<br/>(axios)"| SB
    SB -->|"Verify Token"| GOOGLE
    SB -->|"Read/Write"| DB
    EO -->|"Redirect to login"| SF
    HRM -->|"Redirect to login"| SF
    SF -->|"Redirect + JWT"| EO
    SF -->|"Redirect + JWT"| HRM

    style SSO fill:#4f46e5,color:#fff,stroke:#3730a3
    style Clients fill:#dc2626,color:#fff,stroke:#991b1b
    style External fill:#059669,color:#fff,stroke:#047857
```

---

## Database Schema (ERD)

```mermaid
erDiagram
    USER_MATRIX {
        int id PK
        string email UK
        string name
        string department
        string role
        string image
        string status
    }

    MODULE {
        uuid id PK
        string code UK "e.g. EORDER"
        string name
        string description
        string redirect_url
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    USER_MODULE_ROLE {
        int id PK
        string email FK "→ User Matrix.email"
        string module_code FK "→ Module.code"
        string role "viewer | editor | admin"
    }

    MODULE_MATRIX {
        int id PK
        string email UK
        string module
        string operator
    }

    USER_MATRIX ||--o{ USER_MODULE_ROLE : "has roles"
    MODULE ||--o{ USER_MODULE_ROLE : "assigned to"
    USER_MATRIX ||--o{ MODULE_MATRIX : "has access"
```

> **Note:** `User Matrix` dan `Module Matrix` adalah **external table** (`managed = False`) — Django tidak mengelola migrasinya.

---

## Authentication Flow

### 1. Login via Google OAuth 2.0

```mermaid
sequenceDiagram
    actor User
    participant Client as Client App<br/>(EORDER)
    participant SSO_FE as SSO Frontend
    participant Google as Google OAuth
    participant SSO_BE as SSO Backend
    participant DB as Database

    User->>Client: Akses halaman
    Client->>Client: Cek localStorage<br/>(sso_token)
    alt Token tidak ada / expired
        Client->>SSO_FE: Redirect ke<br/>/login?redirect_url=...
    end

    User->>SSO_FE: Klik "Sign in with Google"
    SSO_FE->>Google: OAuth popup<br/>(useGoogleLogin)
    Google-->>SSO_FE: access_token (Google)
    SSO_FE->>SSO_BE: POST /api/v1/auth/google/<br/>{token: google_access_token}

    SSO_BE->>Google: GET /oauth2/v3/userinfo<br/>Authorization: Bearer token
    Google-->>SSO_BE: {email, name, picture, ...}

    SSO_BE->>DB: Query User Matrix<br/>(email, status=1)
    alt User tidak ditemukan
        SSO_BE-->>SSO_FE: 401 Unauthorized
    end

    SSO_BE->>DB: Query Module Matrix<br/>(email)
    Note right of SSO_BE: module_access =<br/>{"EORDER": "operator", ...}

    SSO_BE->>DB: Query UserModuleRole<br/>(user, module active)
    Note right of SSO_BE: module_roles =<br/>{"EORDER": "editor", ...}

    SSO_BE->>SSO_BE: Generate JWT<br/>(include module_access,<br/>module_roles, user info)
    SSO_BE-->>SSO_FE: {access_token, user}

    SSO_FE->>SSO_FE: localStorage.setItem<br/>(sso_token, sso_user)

    alt redirect_url ada
        SSO_FE->>SSO_FE: Fetch user modules<br/>GET /api/v1/user/modules/
        SSO_FE->>SSO_FE: Validasi redirect_url<br/>cocok dengan module
        SSO_FE->>Client: Redirect ke<br/>redirect_url?token=JWT
    else Tidak ada redirect
        SSO_FE->>SSO_FE: Navigate ke /dashboard
    end
```

### 2. Client App Menerima Token

```mermaid
sequenceDiagram
    participant Client as Client App<br/>(EORDER)
    participant Browser as Browser<br/>localStorage

    Client->>Client: Parse URL params<br/>(?token=xxx)
    alt Token dari URL
        Client->>Browser: localStorage.setItem<br/>(sso_token, token)
        Client->>Client: Clean URL<br/>(history.replaceState)
    end

    Client->>Browser: localStorage.getItem<br/>(sso_token)
    Client->>Client: Decode JWT payload<br/>(base64)

    Client->>Client: Validasi expiration<br/>(payload.exp)
    Client->>Client: Cek module_access<br/>(EORDER exists?)
    Client->>Client: Extract module_roles<br/>(EORDER → editor)

    alt Semua valid
        Client->>Client: setUser, setModuleRole<br/>setIsAuthenticated(true)
    else Invalid / expired
        Client->>Client: Remove token<br/>Redirect ke SSO
    end
```

---

## JWT Payload Structure

```json
{
  "user_id": "123",
  "email": "user@company.com",
  "name": "John Doe",
  "department": "IT",
  "role": "USER",
  "image": "https://...",
  "module_access": {
    "EORDER": "PT XYZ",
    "HRM": "PT ABC"
  },
  "module_roles": {
    "EORDER": "editor",
    "HRM": "viewer"
  },
  "exp": 1718200000,
  "iat": 1718196400
}
```

| Field | Sumber | Keterangan |
|-------|--------|------------|
| `user_id`, `email`, `name`, `department`, `role`, `image` | `User Matrix` | Data profil user |
| `module_access` | `Module Matrix` | Module yang boleh diakses (key=module, value=operator) |
| `module_roles` | `UserModuleRole` | Role per module: `viewer`, `editor`, `admin` |
| `exp` | Config | Waktu expired (default: 60 menit) |
| `impersonated_by` | Impersonate API | (opsional) Email admin yang melakukan impersonasi |

---

## RBAC (Role-Based Access Control)

### Role Hierarchy

```mermaid
graph BT
    VIEWER["👁 Viewer<br/>Level 1"]
    EDITOR["✏️ Editor<br/>Level 2"]
    ADMIN["🛡️ Admin<br/>Level 3"]

    VIEWER --> EDITOR
    EDITOR --> ADMIN

    style VIEWER fill:#dbeafe,stroke:#3b82f6,color:#1e40af
    style EDITOR fill:#fef3c7,stroke:#f59e0b,color:#92400e
    style ADMIN fill:#fce7f3,stroke:#ec4899,color:#9d174d
```

### Menu Access Matrix (EORDER)

| Menu Key | Min Role | Keterangan |
|----------|----------|------------|
| `order_dashboard` | `viewer` | Dashboard utama |
| `order_list` | `viewer` | Daftar order |
| `lpb_confirmation` | `viewer` | Konfirmasi LPB |
| `reports` | `viewer` | Laporan |
| `monitoring_upload` | `viewer` | Monitoring upload |
| `stt_upload` | `editor` | Upload file STT |
| `distribution_groups` | `admin` | Kelola grup distribusi |
| `settings` | `admin` | Pengaturan |

Pengecekan role menggunakan fungsi `hasMinRole()` dan `canAccessMenu()` di `AuthContext`:

```typescript
// User role "editor" → bisa akses menu dengan min role "viewer" dan "editor"
// User role "viewer" → TIDAK bisa akses menu dengan min role "editor" atau "admin"
const hasMinRole = (minRole: ModuleRole): boolean => {
  return (ROLE_LEVEL[moduleRole] ?? 0) >= ROLE_LEVEL[minRole];
};
```

---

## Logout & Cross-Tab Synchronization

```mermaid
sequenceDiagram
    participant Tab1 as EORDER Tab 1
    participant BC as BroadcastChannel<br/>"logout_channel"
    participant LS as localStorage<br/>"sso_token"
    participant Tab2 as EORDER Tab 2
    participant SSO as SSO Portal<br/>/logout

    Tab1->>BC: postMessage("logout")
    Tab1->>LS: removeItem("sso_token")
    Tab1->>SSO: Redirect ke<br/>/logout?redirect_url=...

    par BroadcastChannel listener
        BC-->>Tab2: onmessage → "logout"
        Tab2->>SSO: Redirect ke /logout
    and localStorage listener (fallback)
        LS-->>Tab2: storage event<br/>(key=sso_token, newValue=null)
        Tab2->>SSO: Redirect ke /logout
    end
```

### Mekanisme

| Mekanisme | Cara Kerja | Scope |
|-----------|-----------|-------|
| **BroadcastChannel** | Channel `logout_channel` — tab yang logout mengirim pesan, tab lain mendengarkan | Same-origin saja |
| **Storage Event** | Mendeteksi `sso_token` dihapus dari `localStorage` oleh tab lain | Same-origin (fallback) |

> **Catatan:** Kedua mekanisme hanya bekerja dalam **same-origin**. Logout dari SSO Portal ke Client App yang berbeda origin ditangani via redirect ke `/logout?redirect_url=...`.

---

## Admin Impersonation (Backdoor)

```mermaid
sequenceDiagram
    actor Admin
    participant SSO_FE as SSO Frontend
    participant SSO_BE as SSO Backend
    participant DB as Database

    Admin->>SSO_FE: Klik "Backdoor Login"<br/>(dropdown menu, ADMIN only)
    SSO_FE->>SSO_FE: Tampilkan ImpersonateModal
    Admin->>SSO_FE: Input target email
    SSO_FE->>SSO_BE: POST /api/v1/auth/impersonate/<br/>{email: target}<br/>Authorization: Bearer admin_token

    SSO_BE->>SSO_BE: Decode admin JWT<br/>Cek role == "ADMIN"
    alt Bukan ADMIN
        SSO_BE-->>SSO_FE: 403 Permission Denied
    end

    SSO_BE->>DB: Query target User<br/>(email, status=1)
    SSO_BE->>DB: Query Module Matrix & Roles<br/>(target email)
    SSO_BE->>SSO_BE: Generate JWT<br/>(target user data,<br/>impersonated_by: admin email)
    SSO_BE-->>SSO_FE: {access_token, user, impersonated_by}

    SSO_FE->>SSO_FE: login(targetUser, newToken)
    SSO_FE->>SSO_FE: Reload halaman<br/>(tampil sebagai target user)

    Note over SSO_FE: Banner ditampilkan:<br/>"Impersonating user@email —<br/>session is temporary"
```

---

## API Endpoints

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| `POST` | `/api/v1/auth/google/` | ❌ | Login via Google OAuth token |
| `POST` | `/api/v1/auth/impersonate/` | ✅ ADMIN | Generate JWT untuk user lain |
| `GET` | `/api/v1/user/modules/` | ✅ Bearer | Daftar module yang bisa diakses user |
| `GET` | `/api/v1/user/menu-access/` | ✅ Bearer | Role user per module (RBAC) |

---

## Frontend Routes

### SSO Portal

| Path | Component | Auth | Keterangan |
|------|-----------|------|------------|
| `/login` | `LoginPage` | ❌ | Halaman login (Google OAuth) |
| `/dashboard` | `SSOHomepageGrid` | ✅ | Daftar aplikasi yang bisa diakses |
| `/logout` | `Logout` | - | Hapus token, redirect ke login |

### Client App (EORDER)

| Path | Keterangan | Min Role |
|------|------------|----------|
| `/` | Dashboard | `viewer` |
| `/orders` | Order List | `viewer` |
| `/stt-upload` | Upload File STT | `editor` |
| `/distribution-groups` | Distribution Groups | `admin` |
| `/settings` | Settings | `admin` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **SSO Frontend** | React 19, TypeScript, Vite, React Router, Axios, `@react-oauth/google` |
| **SSO Backend** | Django 5, Django REST Framework, PyJWT |
| **Database** | MySQL |
| **Authentication** | Google OAuth 2.0 + JWT |
| **Authorization** | RBAC (viewer / editor / admin per module) |

---

## Environment Variables

### SSO Backend (`sso_backend/.env`)

```env
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_LIFETIME=60
```

### SSO Frontend (`sso_frontend/.env`)

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

### Client App (`eorder-client/.env`)

```env
VITE_SSO_URL=http://localhost:5173
```

---

## Flow Ringkasan

```mermaid
flowchart LR
    A["User buka<br/>Client App"] --> B{"Token ada<br/>& valid?"}
    B -->|Ya| C["Decode JWT<br/>Set Auth Context"]
    B -->|Tidak| D["Redirect ke<br/>SSO /login"]
    D --> E["Google<br/>OAuth Login"]
    E --> F["SSO Backend<br/>Issue JWT"]
    F --> G["Redirect balik<br/>ke Client App<br/>?token=JWT"]
    G --> A

    C --> H{"Role cukup?"}
    H -->|Ya| I["✅ Tampilkan<br/>Menu/Halaman"]
    H -->|Tidak| J["🚫 Hidden /<br/>Redirect"]

    style A fill:#f3f4f6,stroke:#6b7280,color:#111
    style D fill:#4f46e5,stroke:#3730a3,color:#fff
    style E fill:#ea4335,stroke:#cc0000,color:#fff
    style F fill:#059669,stroke:#047857,color:#fff
    style I fill:#22c55e,stroke:#16a34a,color:#fff
    style J fill:#ef4444,stroke:#dc2626,color:#fff
```
