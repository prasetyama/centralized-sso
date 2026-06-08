import { useAuth } from '../context/AuthContext';
import { LayoutGrid, ExternalLink, LogOut } from 'lucide-react';

export const SSOHomepageGrid = () => {
  const { user, token, modules, logout, loadingData, errorData } = useAuth();

  const handleAppClick = (url: string) => {
    // Navigate to the client app, passing the token if needed
    window.location.href = `${url}?token=${token}`;
  };

  if (loadingData) return <div className="flex justify-center items-center h-screen">Loading apps...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <LayoutGrid className="text-indigo-600" size={28} />
          <h1 className="text-xl font-bold text-gray-800">My Applications</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {user?.image ? (
              <img src={user.image} alt="Profile" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                {user?.name?.charAt(0)}
              </div>
            )}
            <span className="text-sm font-medium text-gray-700">{user?.name}</span>
          </div>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-red-500 transition-colors p-2 cursor-pointer"
            title="Log out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {errorData && <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-6">{errorData}</div>}

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
                  <ExternalLink size={20} className="text-gray-400 group-hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{mod.module}</h3>
                <p className="text-sm text-gray-500 flex-1">{mod.operator || 'Access module application.'}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
