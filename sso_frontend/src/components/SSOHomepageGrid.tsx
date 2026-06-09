import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutGrid, ExternalLink, LogOut, ChevronDown,
  Shield, X, Loader2, AlertCircle, CheckCircle2,
  User
} from 'lucide-react';
import { impersonateUser } from '../api/api';

// ─── Backdoor / Impersonate Modal ────────────────────────────────────────────
const ImpersonateModal = ({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
}) => {
  const { token } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await impersonateUser(token!, email.trim());
      const { access_token, user } = res.data;
      setSuccess(`Impersonating ${user.name || user.email}…`);
      setTimeout(() => onSuccess(access_token, user), 800);
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        'Impersonation failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Backdoor Login</h2>
              <p className="text-white/70 text-xs">Admin-only · Impersonate a user</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              id="impersonate-email"
              type="email"
              autoFocus
              required
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || !!success}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !!success}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? (
                <><Loader2 size={15} className="animate-spin" /> Impersonating…</>
              ) : (
                <><User size={15} /> Login</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Header Dropdown ──────────────────────────────────────────────────────────
const UserDropdown = ({ onImpersonate }: { onImpersonate: () => void }) => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        id="user-dropdown-btn"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
      >
        {user?.image ? (
          <img src={user.image} alt="Profile" className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-200" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm ring-2 ring-indigo-200">
            {user?.name?.charAt(0)?.toUpperCase()}
          </div>
        )}
        <div className="flex flex-col items-start text-left hidden sm:flex">
          <span className="text-sm font-semibold text-gray-800 leading-tight">{user?.name}</span>
          <span className="text-xs text-gray-400 leading-tight">{user?.role}</span>
        </div>
        <ChevronDown
          size={15}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-40 overflow-hidden">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-800 truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            {isAdmin && (
              <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700">
                ADMIN
              </span>
            )}
          </div>

          {/* Backdoor login — ADMIN only */}
          {isAdmin && (
            <button
              id="backdoor-login-btn"
              onClick={() => { setOpen(false); onImpersonate(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-violet-700 hover:bg-violet-50 transition-colors font-medium"
            >
              <Shield size={15} className="text-violet-500" />
              Backdoor Login
            </button>
          )}

          {/* Divider */}
          <div className="border-t border-gray-100 my-1" />

          {/* Logout */}
          <button
            id="dropdown-logout-btn"
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={15} className="text-red-400" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const SSOHomepageGrid = () => {
  const { token, modules, login, logout, loadingData, errorData } = useAuth();
  const [showImpersonate, setShowImpersonate] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const handleAppClick = (url: string) => {
    window.location.href = `${url}?token=${token}`;
  };

  const handleImpersonateSuccess = (newToken: string, newUser: any) => {
    setShowImpersonate(false);
    const userData = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      department: newUser.department || '',
      role: newUser.role || '',
      image: newUser.image || '',
    };
    setImpersonating(newUser.email);
    login(userData, newToken);
    // Brief delay so login() state propagates, then reload modules
    setTimeout(() => window.location.reload(), 300);
  };

  if (loadingData) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-3 text-gray-500">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
        <span className="text-sm">Loading applications…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Impersonate Banner */}
      {impersonating && (
        <div className="bg-violet-600 text-white text-xs px-4 py-2 flex items-center justify-center gap-2">
          <Shield size={13} />
          <span>
            Impersonating <strong>{impersonating}</strong> — session is temporary
          </span>
          <button
            onClick={logout}
            className="ml-3 underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            End session
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <LayoutGrid className="text-indigo-600" size={28} />
          <h1 className="text-xl font-bold text-gray-800">My Applications</h1>
        </div>
        <UserDropdown onImpersonate={() => setShowImpersonate(true)} />
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {errorData && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">
            <AlertCircle size={16} />
            {errorData}
          </div>
        )}

        {modules.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-semibold text-gray-600 mb-2">No Applications Found</h2>
            <p className="text-gray-500">You do not have access to any modules yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {modules.map((mod) => (
              <div
                key={mod.module}
                onClick={() => handleAppClick(mod.redirect_url)}
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group flex flex-col h-full"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <LayoutGrid size={24} />
                  </div>
                  <ExternalLink
                    size={20}
                    className="text-gray-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"
                  />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{mod.module}</h3>
                <p className="text-sm text-gray-500 flex-1">{mod.operator || 'Access module application.'}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Backdoor Modal */}
      {showImpersonate && (
        <ImpersonateModal
          onClose={() => setShowImpersonate(false)}
          onSuccess={handleImpersonateSuccess}
        />
      )}
    </div>
  );
};
