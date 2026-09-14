import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    fetchEOrderUsers,
    importEOrderUsersCsv,
    createEOrderUser,
    updateEOrderUser,
    deleteEOrderUser,
    fetchEOrderDistributors,
    fetchEOrderImportLogs,
    fetchEOrderImportLogDetail
} from '../api/api';
import {
    Users,
    Upload,
    FileText,
    Plus,
    Search,
    Edit,
    Trash2,
    ArrowLeft,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Shield,
    X,
    Key,
    RefreshCw,
    Eye
} from 'lucide-react';

export const EOrderUserManagement = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

    const [activeTab, setActiveTab] = useState<'users' | 'upload' | 'logs'>('users');
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [usersList, setUsersList] = useState<any[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // CSV Upload state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvText, setCsvText] = useState('');
    const [csvPreview, setCsvPreview] = useState<any[]>([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<any | null>(null);

    // Logs state
    const [logsList, setLogsList] = useState<any[]>([]);
    const [viewingLog, setViewingLog] = useState<{ filename: string; content: string } | null>(null);

    // Modal state (Create / Edit User)
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        fname: '',
        reset_password: false,
        selected_ship_tos: [] as string[]
    });
    const [distributorOptions, setDistributorOptions] = useState<any[]>([]);
    const [distSearch, setDistSearch] = useState('');

    // Modal state (Delete User)
    const [deletingUser, setDeletingUser] = useState<any | null>(null);

    // Load user list
    const loadUsers = async () => {
        if (!token) return;
        setLoading(true);
        setErrorMsg(null);
        try {
            const data = await fetchEOrderUsers(token, searchQuery);
            setUsersList(data.users || []);
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Failed to load users list.');
        } finally {
            setLoading(false);
        }
    };

    // Load distributor options
    const loadDistributors = async (query = '') => {
        if (!token) return;
        try {
            const data = await fetchEOrderDistributors(token, query);
            setDistributorOptions(data.distributors || []);
        } catch (err) {
            console.error('Failed to load distributors list', err);
        }
    };

    // Load logs list
    const loadLogs = async () => {
        if (!token) return;
        try {
            const data = await fetchEOrderImportLogs(token);
            setLogsList(data.logs || []);
        } catch (err) {
            console.error('Failed to load import logs', err);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            if (activeTab === 'users') loadUsers();
            if (activeTab === 'logs') loadLogs();
        }
    }, [activeTab, isAdmin, token]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (activeTab === 'users' && isAdmin) {
                loadUsers();
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Handle CSV parse preview
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvFile(file);
        setImportResult(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setCsvText(text);
            parseCsvPreview(text);
        };
        reader.readAsText(file);
    };

    const parseCsvPreview = (text: string) => {
        const lines = text.split(/\r?\n/);
        const nonCols = lines.filter((l: string) => l.trim());
        if (nonCols.length === 0) {
            setCsvPreview([]);
            return;
        }

        const firstLine = nonCols[0];
        const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

        const rows = nonCols.map((line: string) => line.split(delimiter).map((c: string) => c.trim()));
        let startIndex = 0;
        if (rows[0][0].toLowerCase().includes('distid') || rows[0][2]?.toLowerCase().includes('username')) {
            startIndex = 1;
        }

        const previewData = rows.slice(startIndex, startIndex + 10).map((r: string[]) => ({
            distid: r[0] || '',
            distributor_name: r[1] || '',
            username: r[2] || '',
            email: r[3] || '',
            primary_email: (r[3] || '').split(',')[0].trim()
        }));

        setCsvPreview(previewData);
    };

    // Execute CSV import
    const handleImportCsv = async () => {
        if (!csvFile && !csvText.trim()) return;
        setImporting(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            const payload = csvFile || csvText;
            const res = await importEOrderUsersCsv(token!, payload);
            setImportResult(res);
            setSuccessMsg(`Import finished: ${res.success_count} succeeded, ${res.failed_count} failed.`);
            loadUsers();
            loadLogs();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'CSV import failed.');
        } finally {
            setImporting(false);
        }
    };

    // Open User Edit Modal
    const handleOpenEdit = (userItem: any) => {
        setEditingUser(userItem);
        setFormData({
            username: userItem.username || '',
            email: userItem.email || '',
            fname: userItem.fname || '',
            reset_password: false,
            selected_ship_tos: userItem.mapped_areas ? userItem.mapped_areas.map((a: any) => a.shiptord).filter(Boolean) : []
        });
        loadDistributors();
        setShowUserModal(true);
    };

    // Open User Create Modal
    const handleOpenCreate = () => {
        setEditingUser(null);
        setFormData({
            username: '',
            email: '',
            fname: '',
            reset_password: false,
            selected_ship_tos: []
        });
        loadDistributors();
        setShowUserModal(true);
    };

    // Submit Create / Edit User
    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setSuccessMsg(null);
        setLoading(true);

        try {
            if (editingUser) {
                await updateEOrderUser(token!, editingUser.id, {
                    username: formData.username,
                    email: formData.email,
                    fname: formData.fname,
                    reset_password: formData.reset_password,
                    ship_to_list: formData.selected_ship_tos
                });
                setSuccessMsg(`User '${formData.username}' updated successfully.`);
            } else {
                await createEOrderUser(token!, {
                    username: formData.username,
                    email: formData.email,
                    fname: formData.fname,
                    ship_to_list: formData.selected_ship_tos
                });
                setSuccessMsg(`User '${formData.username}' created successfully.`);
            }
            setShowUserModal(false);
            loadUsers();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Failed to save user.');
        } finally {
            setLoading(false);
        }
    };

    // Confirm Delete User
    const handleDeleteUser = async () => {
        if (!deletingUser) return;
        setLoading(true);
        setErrorMsg(null);
        try {
            await deleteEOrderUser(token!, deletingUser.id);
            setSuccessMsg(`User '${deletingUser.username}' deleted successfully.`);
            setDeletingUser(null);
            loadUsers();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Failed to delete user.');
        } finally {
            setLoading(false);
        }
    };

    // View Log detail
    const handleViewLogDetail = async (filename: string) => {
        try {
            const data = await fetchEOrderImportLogDetail(token!, filename);
            setViewingLog({ filename: data.filename, content: data.content });
        } catch (err) {
            console.error('Failed to read log detail', err);
        }
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center space-y-4">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                        <Shield size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">Access Denied</h2>
                    <p className="text-sm text-gray-500">Only SSO users with <strong>role = ADMIN</strong> are authorized to access E-Order User Management.</p>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm transition-colors cursor-pointer"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                            title="Back to Applications"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-gray-800">E-Order User Management</h1>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700 uppercase">
                                    ADMIN ROLE
                                </span>
                            </div>
                            <p className="text-xs text-gray-500">Import CSV, manage matrix access, distributor mapping, and user accounts</p>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="max-w-7xl mx-auto px-6 flex gap-8 border-t border-gray-100">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'users'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <Users size={16} />
                        User List
                    </button>

                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'upload'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <Upload size={16} />
                        Import CSV
                    </button>

                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`py-3.5 text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'logs'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        <FileText size={16} />
                        Import Logs
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
                {/* Global Messages */}
                {errorMsg && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-3">
                            <AlertCircle size={18} className="shrink-0 text-red-500" />
                            <span className="text-sm">{errorMsg}</span>
                        </div>
                        <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600 p-1">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {successMsg && (
                    <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 size={18} className="shrink-0 text-green-500" />
                            <span className="text-sm">{successMsg}</span>
                        </div>
                        <button onClick={() => setSuccessMsg(null)} className="text-green-400 hover:text-green-600 p-1">
                            <X size={16} />
                        </button>
                    </div>
                )}

                {/* --- TAB 1: USER LIST --- */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        {/* Search & Actions Bar */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
                            <div className="relative w-full sm:w-80">
                                <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search username, email, distributor..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                />
                            </div>

                            <div className="flex gap-3 w-full sm:w-auto justify-end">
                                <button
                                    onClick={loadUsers}
                                    className="p-2 text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                                    title="Refresh Data"
                                >
                                    <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                                </button>
                                <button
                                    onClick={handleOpenCreate}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                                >
                                    <Plus size={18} />
                                    Create User
                                </button>
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            {loading ? (
                                <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
                                    <Loader2 className="animate-spin text-indigo-600" size={28} />
                                    <span>Loading EORDERWEB users...</span>
                                </div>
                            ) : usersList.length === 0 ? (
                                <div className="p-16 text-center text-gray-400 space-y-3">
                                    <Users size={40} className="mx-auto text-gray-300" />
                                    <p className="font-medium text-gray-600">No EORDERWEB users found</p>
                                    <p className="text-xs text-gray-400">Import CSV or create a user manually to populate the list.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            <tr>
                                                <th className="py-3.5 px-4">Username</th>
                                                <th className="py-3.5 px-4">Distributor Name</th>
                                                <th className="py-3.5 px-4">Primary Email</th>
                                                <th className="py-3.5 px-4">Mapped Ship-To Areas</th>
                                                <th className="py-3.5 px-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {usersList.map((u) => (
                                                <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
                                                    <td className="py-3.5 px-4 font-semibold text-gray-800">
                                                        {u.username}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-gray-700">
                                                        {u.fname || '-'}
                                                    </td>
                                                    <td className="py-3.5 px-4 text-gray-600 font-mono text-xs">
                                                        {u.email || '-'}
                                                    </td>
                                                    <td className="py-3.5 px-4">
                                                        {u.mapped_areas && u.mapped_areas.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1.5 max-w-md">
                                                                {u.mapped_areas.map((area: any) => (
                                                                    <span
                                                                        key={area.id}
                                                                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                                                                        title={`${area.rd_desc || ''} (${area.zone || ''})`}
                                                                    >
                                                                        {area.shiptord} - {area.zone}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-400 italic">No distributor areas</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3.5 text-right space-x-2">
                                                        <button
                                                            onClick={() => handleOpenEdit(u)}
                                                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                                            title="Edit User"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeletingUser(u)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                            title="Delete User"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- TAB 2: CSV UPLOAD --- */}
                {activeTab === 'upload' && (
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 mb-1">CSV File Upload & User Import</h3>
                                <p className="text-xs text-gray-500">
                                    Upload a CSV/TSV file to create/update users in <code className="bg-gray-100 px-1 py-0.5 rounded">users</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">module_matrix</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">user_module_role</code>, and <code className="bg-gray-100 px-1 py-0.5 rounded">std_area_matrix</code>.
                                </p>
                            </div>

                            {/* Format Guide Box */}
                            <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 space-y-2">
                                <div className="flex items-center gap-2 text-indigo-800 font-semibold text-xs uppercase tracking-wider">
                                    <FileText size={14} />
                                    CSV Format Specification
                                </div>
                                <p className="text-xs text-indigo-900 leading-relaxed">
                                    Columns: <strong>distid</strong>, <strong>Distributor Name</strong>, <strong>username</strong>, <strong>email</strong> (Tab or Comma separated).<br />
                                    • Multiple comma-separated emails will use the <strong>first email</strong> for account creation.<br />
                                    • Multiple rows with same username/email and different distids will create multiple <strong>std_area_matrix</strong> ship-to entries.
                                </p>

                                <div className="bg-white/80 p-3 rounded-lg border border-indigo-200 text-mono text-xs text-gray-700 overflow-x-auto">
                                    <div className="font-bold text-gray-400 text-[10px] uppercase mb-1">Sample Input Format:</div>
                                    <pre className="text-[11px]">
                                        {`distid\tDistributor Name\tusername\temail
460000\tANUGERAH FAJAR\tanugerah.fajar\taf_ptk@yahoo.com,rudy_af19@yahoo.com
10200\tPT. ANUGERAH PANGAN PRIMA LESTARI\tanugerahpanganpl.tng\tamin1.appl@gmail.com`}
                                    </pre>
                                </div>
                            </div>

                            {/* Upload Area */}
                            <div className="space-y-4">
                                <label className="block border-2 border-dashed border-gray-300 hover:border-indigo-500 rounded-2xl p-8 text-center bg-gray-50/50 hover:bg-indigo-50/20 transition-all cursor-pointer">
                                    <input
                                        type="file"
                                        accept=".csv,.tsv,.txt"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                    <Upload size={32} className="mx-auto text-indigo-500 mb-3" />
                                    <p className="text-sm font-semibold text-gray-700">
                                        {csvFile ? csvFile.name : 'Click to upload or drag & drop CSV file'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">Supports .csv or .tsv files</p>
                                </label>

                                <div className="text-center text-xs text-gray-400 uppercase font-bold tracking-wider">or paste CSV raw text directly</div>

                                <textarea
                                    rows={4}
                                    placeholder="Paste CSV text content here..."
                                    value={csvText}
                                    onChange={(e) => {
                                        setCsvText(e.target.value);
                                        setCsvFile(null);
                                        parseCsvPreview(e.target.value);
                                    }}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                                />
                            </div>

                            {/* Preview Table */}
                            {csvPreview.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Parsed CSV Preview (First {csvPreview.length} rows)</h4>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-gray-50 border-b border-gray-100 font-semibold text-gray-500">
                                                <tr>
                                                    <th className="py-2.5 px-3">DistID</th>
                                                    <th className="py-2.5 px-3">Distributor Name</th>
                                                    <th className="py-2.5 px-3">Username</th>
                                                    <th className="py-2.5 px-3">Raw Email</th>
                                                    <th className="py-2.5 px-3 text-indigo-600 font-bold">Selected Primary Email</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {csvPreview.map((p, idx) => (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                        <td className="py-2 px-3 font-mono font-bold text-gray-700">{p.distid}</td>
                                                        <td className="py-2 px-3 text-gray-800">{p.distributor_name}</td>
                                                        <td className="py-2 px-3 font-medium text-gray-700">{p.username}</td>
                                                        <td className="py-2 px-3 text-gray-400">{p.email}</td>
                                                        <td className="py-2 px-3 font-mono font-bold text-indigo-600">{p.primary_email}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end pt-4 border-t border-gray-100">
                                <button
                                    disabled={importing || (!csvFile && !csvText.trim())}
                                    onClick={handleImportCsv}
                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                                >
                                    {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                    {importing ? 'Importing Users...' : 'Start Import CSV'}
                                </button>
                            </div>
                        </div>

                        {/* Import Result Card */}
                        {importResult && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4 animate-in fade-in">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                                            <CheckCircle2 size={22} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-base">Import Completed</h4>
                                            <p className="text-xs text-gray-400">Log file saved: <span className="font-mono text-gray-600">{importResult.log_file}</span></p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                            {importResult.success_count} Succeeded
                                        </span>
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                                            {importResult.failed_count} Failed
                                        </span>
                                    </div>
                                </div>

                                {/* Detail Summary */}
                                <div className="space-y-2">
                                    <h5 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Detailed Row Processing Summary</h5>
                                    <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50/50 p-3 space-y-1.5 text-xs font-mono">
                                        {importResult.details.map((d: any, i: number) => (
                                            <div
                                                key={i}
                                                className={`p-2 rounded-lg flex items-center justify-between ${d.status === 'success' ? 'bg-green-50/80 text-green-800 border border-green-200' : 'bg-red-50/80 text-red-800 border border-red-200'
                                                    }`}
                                            >
                                                <span>
                                                    Row {d.row}: {d.username} ({d.email || d.distid})
                                                </span>
                                                <span className="font-bold text-[11px] uppercase">
                                                    {d.status === 'success' ? `ShipTo: ${d.shiptord}` : d.error}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB 3: IMPORT LOGS --- */}
                {activeTab === 'logs' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-800 text-base">Historical Import Log Files</h3>
                                <button onClick={loadLogs} className="p-2 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-gray-50">
                                    <RefreshCw size={16} />
                                </button>
                            </div>

                            {logsList.length === 0 ? (
                                <div className="p-12 text-center text-gray-400 text-sm">
                                    No import log files created yet.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {logsList.map((logFile) => (
                                        <div key={logFile.filename} className="p-4 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                                    <FileText size={18} />
                                                </div>
                                                <div>
                                                    <p className="font-mono text-sm font-semibold text-gray-800">{logFile.filename}</p>
                                                    <p className="text-xs text-gray-400">Created: {new Date(logFile.created_at).toLocaleString()} · {(logFile.size_bytes / 1024).toFixed(1)} KB</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleViewLogDetail(logFile.filename)}
                                                className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                                            >
                                                <Eye size={14} />
                                                View Log
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* --- MODAL: CREATE / EDIT USER --- */}
            {showUserModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden my-8 animate-in fade-in zoom-in-95">
                        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <Users size={20} />
                                <h3 className="font-bold text-base">
                                    {editingUser ? `Edit User: ${editingUser.username}` : 'Create New EORDERWEB User'}
                                </h3>
                            </div>
                            <button onClick={() => setShowUserModal(false)} className="text-white/70 hover:text-white p-1">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Username</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                                    placeholder="e.g. anugerah.fajar"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Primary Email</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                                    placeholder="user@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Distributor Name (fname)</label>
                                <input
                                    type="text"
                                    value={formData.fname}
                                    onChange={(e) => setFormData({ ...formData, fname: e.target.value })}
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                                    placeholder="e.g. PT. ANUGERAH FAJAR"
                                />
                            </div>

                            {editingUser && (
                                <div className="pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.reset_password}
                                            onChange={(e) => setFormData({ ...formData, reset_password: e.target.checked })}
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                                            <Key size={14} /> Reset password to default (123456%qaz!)
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Distributor Selector (std_area_matrix) */}
                            <div className="space-y-2 pt-2 border-t border-gray-100">
                                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">
                                    Mapped Distributor Ship-To Areas (std_area_matrix)
                                </label>

                                <input
                                    type="text"
                                    placeholder="Search distributor name or ship-to..."
                                    value={distSearch}
                                    onChange={(e) => {
                                        setDistSearch(e.target.value);
                                        loadDistributors(e.target.value);
                                    }}
                                    className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                                />

                                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50/50 p-2 space-y-1">
                                    {distributorOptions.map((dist) => {
                                        const shipToVal = dist.ship_to || dist.dist_id;
                                        const isChecked = formData.selected_ship_tos.includes(shipToVal);
                                        return (
                                            <label key={dist.dist_id} className="flex items-center p-1.5 hover:bg-white rounded-lg cursor-pointer transition-colors text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setFormData({ ...formData, selected_ship_tos: [...formData.selected_ship_tos, shipToVal] });
                                                        } else {
                                                            setFormData({ ...formData, selected_ship_tos: formData.selected_ship_tos.filter(s => s !== shipToVal) });
                                                        }
                                                    }}
                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                />
                                                <span className="ml-2 font-medium text-gray-800">
                                                    {dist.dist_name} ({dist.city || dist.dist_id}) - <code className="text-indigo-600 font-bold">{shipToVal}</code>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>

                                {formData.selected_ship_tos.length > 0 && (
                                    <p className="text-[11px] font-bold text-indigo-600">
                                        {formData.selected_ship_tos.length} Ship-To Area(s) Selected
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowUserModal(false)}
                                    className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl text-sm cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-sm cursor-pointer"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    {editingUser ? 'Save Changes' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- MODAL: DELETE CONFIRMATION --- */}
            {deletingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                                <Trash2 size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">Delete User</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Are you sure you want to delete user <strong>{deletingUser.username}</strong> ({deletingUser.email})?<br />
                                    This will remove records from <code className="bg-gray-100 px-1 py-0.5 rounded">users</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">module_matrix</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">user_module_role</code>, and <code className="bg-gray-100 px-1 py-0.5 rounded">std_area_matrix</code>.
                                </p>
                            </div>

                            <div className="flex justify-center gap-3 pt-2">
                                <button
                                    onClick={() => setDeletingUser(null)}
                                    className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-xl text-sm cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={loading}
                                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-sm cursor-pointer"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    Confirm Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: LOG FILE VIEWER --- */}
            {viewingLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in">
                        <div className="bg-gray-900 p-4 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2 font-mono text-sm">
                                <FileText size={18} className="text-indigo-400" />
                                {viewingLog.filename}
                            </div>
                            <button onClick={() => setViewingLog(null)} className="text-gray-400 hover:text-white p-1">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 bg-gray-950 text-gray-200 font-mono text-xs overflow-y-auto flex-1 whitespace-pre-wrap leading-relaxed">
                            {viewingLog.content}
                        </div>

                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setViewingLog(null)}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-xl text-sm cursor-pointer"
                            >
                                Close Log
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
