import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    fetchStdAreaMatrix,
    fetchStdAreaMatrixOptions,
    saveStdAreaMatrixUserMapping,
    deleteStdAreaMatrixUserMapping,
    createStdAreaMatrixRow,
    updateStdAreaMatrixRow,
    deleteStdAreaMatrixRow,
    exportStdAreaMatrixExcel
} from '../api/api';
import type { StdAreaMatrixEntryPayload } from '../api/api';
import {
    ArrowLeft,
    Search,
    Plus,
    Edit,
    Trash2,
    RefreshCw,
    Download,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Shield,
    X,
    MapPin,
    Users,
    Table,
    ChevronDown,
    ChevronRight
} from 'lucide-react';

interface MatrixRowItem {
    id: number;
    email: string;
    name?: string | null;
    department?: string | null;
    manager_email?: string | null;
    remarks?: string | null;
    mapping_type?: 'RSM' | 'ASM' | 'GLOBAL' | 'DISTRIBUTOR';
    zone: string;
    rd_desc: string;
    operator: 'EQ' | 'EX';
    shiptord: string;
    dist_id?: string | null;
    dist_name?: string | null;
    city?: string | null;
    is_zone_all?: boolean;
}

interface GroupedUserMatrix {
    email: string;
    name: string | null;
    department: string | null;
    user_role: string | null;
    manager_email: string | null;
    manager_name: string | null;
    remarks: string | null;
    mapping_type: 'RSM' | 'ASM' | 'GLOBAL' | 'DISTRIBUTOR';
    zones: string[];
    eq_count: number;
    ex_count: number;
    total_rows: number;
    rows: MatrixRowItem[];
    matching_rows_count: number;
}

interface CandidateUserOption {
    email: string;
    name: string | null;
    department: string | null;
    role: string | null;
    manager_email: string | null;
    remarks: string | null;
    suggested_type: 'RSM' | 'ASM';
}

interface DistributorOption {
    ship_to: string;
    dist_id: string;
    dist_name: string;
    city: string;
    zone: string;
    is_active: boolean;
    rd_desc: string;
}

type MappingTypeFilter = 'rsm_asm' | 'RSM' | 'ASM' | 'GLOBAL' | 'all';

const MAPPING_BADGE_STYLES: Record<string, { label: string; className: string }> = {
    RSM: {
        label: 'RSM (Zone)',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-200'
    },
    ASM: {
        label: 'ASM (Spesifik RD)',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200'
    },
    GLOBAL: {
        label: 'Global (ALL)',
        className: 'bg-amber-50 text-amber-800 border-amber-200'
    },
    DISTRIBUTOR: {
        label: 'Akun RD',
        className: 'bg-gray-100 text-gray-800 border-gray-300'
    }
};

export const StdAreaMatrixManagement = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

    const [viewMode, setViewMode] = useState<'users' | 'rows'>('users');
    const [mappingTypeFilter, setMappingTypeFilter] = useState<MappingTypeFilter>('rsm_asm');
    const [zoneFilter, setZoneFilter] = useState('');
    const [operatorFilter, setOperatorFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [groupedUsers, setGroupedUsers] = useState<GroupedUserMatrix[]>([]);
    const [flatRows, setFlatRows] = useState<MatrixRowItem[]>([]);
    const [availableZones, setAvailableZones] = useState<string[]>([
        'ZONE-1', 'ZONE-2', 'ZONE-3', 'ZONE-4', 'ZONE-5',
        'ZONE-6', 'ZONE-7', 'ZONE-8', 'ZONE-9', 'ALL', 'ZONE-0', 'NO ZONE'
    ]);
    const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

    const [optionsLoaded, setOptionsLoaded] = useState(false);
    const [candidateUsers, setCandidateUsers] = useState<CandidateUserOption[]>([]);
    const [distributorOptions, setDistributorOptions] = useState<DistributorOption[]>([]);

    const zoneDistCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const d of distributorOptions) {
            if (!d.is_active) continue;
            const z = (d.zone || '').toUpperCase();
            counts[z] = (counts[z] || 0) + 1;
        }
        return counts;
    }, [distributorOptions]);

    const [showUserMappingModal, setShowUserMappingModal] = useState(false);
    const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
    const [targetEmail, setTargetEmail] = useState('');
    const [userPickerSearch, setUserPickerSearch] = useState('');
    const [builderTab, setBuilderTab] = useState<'rsm_zone' | 'asm_dist'>('asm_dist');
    const [modalDistZoneFilter, setModalDistZoneFilter] = useState('');
    const [modalDistSearch, setModalDistSearch] = useState('');
    const [modalDistOperator, setModalDistOperator] = useState<'EQ' | 'EX'>('EQ');
    const [draftEntries, setDraftEntries] = useState<StdAreaMatrixEntryPayload[]>([]);

    const [showRowModal, setShowRowModal] = useState(false);
    const [editingRow, setEditingRow] = useState<MatrixRowItem | null>(null);
    const [rowForm, setRowForm] = useState<{
        email: string;
        mode: 'distributor' | 'zone_all' | 'manual';
        zone: string;
        shiptord: string;
        rd_desc: string;
        operator: 'EQ' | 'EX';
    }>({
        email: '',
        mode: 'distributor',
        zone: 'ZONE-1',
        shiptord: '',
        rd_desc: '',
        operator: 'EQ'
    });
    const [rowDistSearch, setRowDistSearch] = useState('');

    const [deleteTarget, setDeleteTarget] = useState<
        | { type: 'user'; email: string; name: string | null; count: number }
        | { type: 'row'; row: MatrixRowItem }
        | null
    >(null);

    const loadMatrixData = async () => {
        if (!token || !isAdmin) return;
        setLoading(true);
        setErrorMsg(null);
        try {
            const data = await fetchStdAreaMatrix(token, {
                q: searchQuery,
                zone: zoneFilter,
                operator: operatorFilter,
                mapping_type: mappingTypeFilter
            });
            setGroupedUsers(data.users || []);
            setFlatRows(data.rows || []);
            if (data.available_zones) {
                setAvailableZones(data.available_zones);
            }
        } catch (err: any) {
            setErrorMsg(
                err.response?.data?.error ||
                'Gagal memuat data std_area_matrix. Periksa koneksi backend SSO lalu coba lagi.'
            );
        } finally {
            setLoading(false);
        }
    };

    const ensureOptionsLoaded = async () => {
        if (!token || optionsLoaded) return;
        try {
            const data = await fetchStdAreaMatrixOptions(token);
            setCandidateUsers(data.candidate_users || []);
            setDistributorOptions(data.distributors || []);
            setOptionsLoaded(true);
        } catch (err) {
            console.error('Failed to load std_area_matrix options', err);
        }
    };

    useEffect(() => {
        if (!isAdmin || !token) return;
        const timer = setTimeout(() => {
            loadMatrixData();
        }, 250);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, token, searchQuery, zoneFilter, operatorFilter, mappingTypeFilter]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (deleteTarget) {
                setDeleteTarget(null);
            } else if (showRowModal) {
                setShowRowModal(false);
            } else if (showUserMappingModal) {
                setShowUserMappingModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteTarget, showRowModal, showUserMappingModal]);

    const toggleExpandUser = (email: string) => {
        setExpandedEmails((prev) => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    };

    const resetFilters = () => {
        setSearchQuery('');
        setZoneFilter('');
        setOperatorFilter('');
        setMappingTypeFilter('rsm_asm');
    };

    const handleExportExcel = async () => {
        if (!token) return;
        setExporting(true);
        setErrorMsg(null);
        try {
            const blobData = await exportStdAreaMatrixExcel(token, {
                q: searchQuery,
                zone: zoneFilter,
                operator: operatorFilter,
                mapping_type: mappingTypeFilter
            });
            const url = window.URL.createObjectURL(new Blob([blobData]));
            const link = document.createElement('a');
            link.href = url;
            const nowStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
            link.setAttribute('download', `std_area_matrix_${nowStr}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setErrorMsg('Gagal mengunduh file Excel std_area_matrix.');
        } finally {
            setExporting(false);
        }
    };

    const handleOpenUserMappingModal = async (userGroup?: GroupedUserMatrix) => {
        await ensureOptionsLoaded();
        setErrorMsg(null);
        if (userGroup) {
            setEditingUserEmail(userGroup.email);
            setTargetEmail(userGroup.email);
            setUserPickerSearch('');
            setBuilderTab(userGroup.mapping_type === 'RSM' || userGroup.mapping_type === 'GLOBAL' ? 'rsm_zone' : 'asm_dist');
            setDraftEntries(
                userGroup.rows.map((r) => ({
                    zone: r.zone || 'ALL',
                    shiptord: r.shiptord,
                    rd_desc: r.rd_desc || '',
                    operator: r.operator
                }))
            );
        } else {
            setEditingUserEmail(null);
            setTargetEmail('');
            setUserPickerSearch('');
            setBuilderTab('asm_dist');
            setDraftEntries([]);
        }
        setModalDistZoneFilter('');
        setModalDistSearch('');
        setModalDistOperator('EQ');
        setShowUserMappingModal(true);
    };

    const toggleZoneAllEntry = (zoneCode: string) => {
        setDraftEntries((prev) => {
            const exists = prev.some(
                (e) => e.zone.toUpperCase() === zoneCode.toUpperCase() && e.shiptord.toUpperCase() === 'ALL' && e.operator === 'EQ'
            );
            if (exists) {
                return prev.filter(
                    (e) => !(e.zone.toUpperCase() === zoneCode.toUpperCase() && e.shiptord.toUpperCase() === 'ALL' && e.operator === 'EQ')
                );
            }
            return [
                ...prev,
                {
                    zone: zoneCode,
                    shiptord: 'ALL',
                    rd_desc: 'ALL',
                    operator: 'EQ'
                }
            ];
        });
    };

    const toggleDistributorEntry = (dist: DistributorOption, operator: 'EQ' | 'EX') => {
        setDraftEntries((prev) => {
            const existingIdx = prev.findIndex(
                (e) => e.shiptord === dist.ship_to && e.operator === operator
            );
            if (existingIdx >= 0) {
                return prev.filter((_, idx) => idx !== existingIdx);
            }
            const filtered = prev.filter((e) => e.shiptord !== dist.ship_to);
            return [
                ...filtered,
                {
                    zone: dist.zone || 'ALL',
                    shiptord: dist.ship_to,
                    rd_desc: dist.rd_desc || dist.dist_name,
                    operator
                }
            ];
        });
    };

    const filteredModalDistributors = useMemo(() => {
        const q = modalDistSearch.trim().toLowerCase();
        return distributorOptions.filter((d) => {
            if (modalDistZoneFilter && d.zone.toUpperCase() !== modalDistZoneFilter.toUpperCase()) {
                return false;
            }
            if (!q) return true;
            return (
                d.ship_to.toLowerCase().includes(q) ||
                d.dist_id.toLowerCase().includes(q) ||
                d.dist_name.toLowerCase().includes(q) ||
                d.city.toLowerCase().includes(q) ||
                d.zone.toLowerCase().includes(q)
            );
        });
    }, [distributorOptions, modalDistZoneFilter, modalDistSearch]);

    const handleSelectAllFilteredDistributors = () => {
        if (filteredModalDistributors.length === 0) return;
        setDraftEntries((prev) => {
            const map = new Map<string, StdAreaMatrixEntryPayload>();
            for (const item of prev) {
                map.set(`${item.zone.toUpperCase()}_${item.shiptord.toUpperCase()}`, item);
            }
            for (const d of filteredModalDistributors) {
                map.set(`${(d.zone || 'ALL').toUpperCase()}_${d.ship_to.toUpperCase()}`, {
                    zone: d.zone || 'ALL',
                    shiptord: d.ship_to,
                    rd_desc: d.rd_desc || d.dist_name,
                    operator: modalDistOperator
                });
            }
            return Array.from(map.values());
        });
    };

    const filteredCandidateUsers = useMemo(() => {
        const q = userPickerSearch.trim().toLowerCase();
        const pool = candidateUsers.filter((u) => {
            if (!q) return (u.department || '').toUpperCase().includes('SO') || u.suggested_type === 'RSM';
            return (
                u.email.toLowerCase().includes(q) ||
                (u.name || '').toLowerCase().includes(q) ||
                (u.department || '').toLowerCase().includes(q) ||
                (u.remarks || '').toLowerCase().includes(q)
            );
        });
        return pool.slice(0, 40);
    }, [candidateUsers, userPickerSearch]);

    const handleSaveUserMapping = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;
        if (!targetEmail.trim()) {
            setErrorMsg('Email user (RSM / ASM) wajib diisi.');
            return;
        }
        if (draftEntries.length === 0) {
            setErrorMsg('Pilih minimal satu Zone atau Distributor Ship-To sebelum menyimpan.');
            return;
        }

        setSaving(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            const res = await saveStdAreaMatrixUserMapping(token, {
                email: targetEmail.trim(),
                old_email: editingUserEmail || undefined,
                entries: draftEntries,
                replace: true
            });
            setSuccessMsg(
                `Mapping std_area_matrix untuk '${res.email}' berhasil disimpan (${res.saved_count} baris).`
            );
            setShowUserMappingModal(false);
            loadMatrixData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Gagal menyimpan mapping user.');
        } finally {
            setSaving(false);
        }
    };

    const handleOpenRowModal = async (row?: MatrixRowItem) => {
        await ensureOptionsLoaded();
        setErrorMsg(null);
        setRowDistSearch('');
        if (row) {
            setEditingRow(row);
            const isZoneAll = row.shiptord.toUpperCase() === 'ALL';
            setRowForm({
                email: row.email,
                mode: isZoneAll ? 'zone_all' : 'manual',
                zone: row.zone || 'ZONE-1',
                shiptord: row.shiptord,
                rd_desc: row.rd_desc || '',
                operator: row.operator
            });
        } else {
            setEditingRow(null);
            setRowForm({
                email: '',
                mode: 'distributor',
                zone: zoneFilter || 'ZONE-1',
                shiptord: '',
                rd_desc: '',
                operator: 'EQ'
            });
        }
        setShowRowModal(true);
    };

    const filteredRowDistributors = useMemo(() => {
        const q = rowDistSearch.trim().toLowerCase();
        return distributorOptions
            .filter((d) => {
                if (!q) return true;
                return (
                    d.ship_to.toLowerCase().includes(q) ||
                    d.dist_id.toLowerCase().includes(q) ||
                    d.dist_name.toLowerCase().includes(q) ||
                    d.city.toLowerCase().includes(q) ||
                    d.zone.toLowerCase().includes(q)
                );
            })
            .slice(0, 60);
    }, [distributorOptions, rowDistSearch]);

    const handleSaveSingleRow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        const payload = {
            email: rowForm.email.trim(),
            zone: rowForm.zone.trim() || 'ALL',
            shiptord: rowForm.mode === 'zone_all' ? 'ALL' : rowForm.shiptord.trim(),
            rd_desc: rowForm.mode === 'zone_all' ? (rowForm.rd_desc.trim() || 'ALL') : rowForm.rd_desc.trim(),
            operator: rowForm.operator
        };

        if (!payload.email || !payload.shiptord) {
            setErrorMsg('Email dan ShipToRD wajib diisi.');
            return;
        }

        setSaving(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            if (editingRow) {
                await updateStdAreaMatrixRow(token, editingRow.id, payload);
                setSuccessMsg(`Baris std_area_matrix #${editingRow.id} (${payload.email}) berhasil diperbarui.`);
            } else {
                await createStdAreaMatrixRow(token, payload);
                setSuccessMsg(`Baris baru std_area_matrix untuk '${payload.email}' -> '${payload.shiptord}' berhasil ditambahkan.`);
            }
            setShowRowModal(false);
            loadMatrixData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Gagal menyimpan baris std_area_matrix.');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!token || !deleteTarget) return;
        setSaving(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        try {
            if (deleteTarget.type === 'user') {
                const res = await deleteStdAreaMatrixUserMapping(token, deleteTarget.email);
                setSuccessMsg(
                    `Seluruh mapping std_area_matrix untuk '${deleteTarget.email}' (${res.deleted_count} baris) telah dihapus.`
                );
            } else {
                await deleteStdAreaMatrixRow(token, deleteTarget.row.id);
                setSuccessMsg(
                    `Baris std_area_matrix #${deleteTarget.row.id} (${deleteTarget.row.email} -> ${deleteTarget.row.shiptord}) telah dihapus.`
                );
            }
            setDeleteTarget(null);
            loadMatrixData();
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || 'Gagal menghapus data std_area_matrix.');
        } finally {
            setSaving(false);
        }
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <main className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-md w-full text-center space-y-4">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-700">
                        <Shield size={30} aria-hidden="true" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900">Akses Ditolak</h1>
                    <p className="text-sm text-gray-600">
                        Halaman Management STD Area Matrix (RSM & ASM) hanya dapat diakses oleh pengguna dengan <strong>role = ADMIN</strong>.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="px-5 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 transition-colors"
                    >
                        Kembali ke Dashboard
                    </button>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/dashboard')}
                            aria-label="Kembali ke Dashboard"
                            title="Kembali ke Dashboard"
                            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors"
                        >
                            <ArrowLeft size={20} aria-hidden="true" />
                        </button>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                                    STD Area Matrix (RSM & ASM)
                                </h1>
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                    ADMIN
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-0.5">
                                Kelola mapping area distributor (Zone & ShipToRD) untuk RSM dan ASM pada tabel <code className="font-mono text-gray-800">std_area_matrix</code>
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleOpenRowModal()}
                            className="px-3.5 py-2.5 min-h-[44px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors"
                        >
                            <Plus size={16} aria-hidden="true" />
                            Tambah Baris Matrix
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenUserMappingModal()}
                            className="px-4 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 transition-colors"
                        >
                            <MapPin size={16} aria-hidden="true" />
                            Mapping RSM / ASM
                        </button>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-6 border-t border-gray-100 overflow-x-auto" role="tablist" aria-label="Mode tampilan std_area_matrix">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'users'}
                        onClick={() => setViewMode('users')}
                        className={`py-3 min-h-[44px] text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors ${viewMode === 'users'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        <Users size={16} aria-hidden="true" />
                        Mapping per User ({groupedUsers.length})
                    </button>

                    <button
                        type="button"
                        role="tab"
                        aria-selected={viewMode === 'rows'}
                        onClick={() => setViewMode('rows')}
                        className={`py-3 min-h-[44px] text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors ${viewMode === 'rows'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        <Table size={16} aria-hidden="true" />
                        Tabel Detail std_area_matrix ({flatRows.length})
                    </button>
                </div>
            </header>

            <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-5">
                {errorMsg && (
                    <div role="alert" className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <AlertCircle size={18} aria-hidden="true" className="shrink-0 text-red-600" />
                            <span className="text-sm">{errorMsg}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setErrorMsg(null)}
                            aria-label="Tutup pesan error"
                            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-red-700 hover:bg-red-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>
                )}

                {successMsg && (
                    <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 size={18} aria-hidden="true" className="shrink-0 text-emerald-700" />
                            <span className="text-sm">{successMsg}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSuccessMsg(null)}
                            aria-label="Tutup pesan sukses"
                            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-emerald-800 hover:bg-emerald-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </div>
                )}

                <section aria-label="Pencarian dan filter tabel" className="bg-white p-4 rounded-2xl shadow-xs border border-gray-200 flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
                        <div>
                            <label htmlFor="matrix-search-input" className="block text-xs font-semibold text-gray-700 mb-1">
                                Cari User / Distributor / Ship-To
                            </label>
                            <div className="relative">
                                <Search size={16} aria-hidden="true" className="absolute left-3.5 top-3 text-gray-500" />
                                <input
                                    id="matrix-search-input"
                                    type="text"
                                    placeholder="Email, nama, ShipToRD, distributor..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="matrix-type-select" className="block text-xs font-semibold text-gray-700 mb-1">
                                Filter Kategori Mapping
                            </label>
                            <select
                                id="matrix-type-select"
                                value={mappingTypeFilter}
                                onChange={(e) => setMappingTypeFilter(e.target.value as MappingTypeFilter)}
                                className="w-full px-3 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                            >
                                <option value="rsm_asm">Semua RSM & ASM (Internal)</option>
                                <option value="RSM">RSM (Per Zone)</option>
                                <option value="ASM">ASM (Spesifik RD)</option>
                                <option value="GLOBAL">Global (ALL Zone)</option>
                                <option value="all">Semua Data (Termasuk Akun RD)</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="matrix-zone-select" className="block text-xs font-semibold text-gray-700 mb-1">
                                Filter Zone
                            </label>
                            <select
                                id="matrix-zone-select"
                                value={zoneFilter}
                                onChange={(e) => setZoneFilter(e.target.value)}
                                className="w-full px-3 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                            >
                                <option value="">Semua Zone</option>
                                {availableZones.map((z) => (
                                    <option key={z} value={z}>
                                        {z}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="matrix-operator-select" className="block text-xs font-semibold text-gray-700 mb-1">
                                Filter Operator
                            </label>
                            <select
                                id="matrix-operator-select"
                                value={operatorFilter}
                                onChange={(e) => setOperatorFilter(e.target.value)}
                                className="w-full px-3 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                            >
                                <option value="">Semua Operator (EQ & EX)</option>
                                <option value="EQ">EQ (Include Area / RD)</option>
                                <option value="EX">EX (Exclude Area / RD)</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        {(searchQuery || zoneFilter || operatorFilter || mappingTypeFilter !== 'rsm_asm') && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="px-3 py-2 min-h-[42px] text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors"
                            >
                                Reset Filter
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={loadMatrixData}
                            disabled={loading}
                            aria-label="Muat ulang data std_area_matrix"
                            title="Muat ulang data"
                            className="p-2.5 min-h-[42px] min-w-[42px] flex items-center justify-center text-gray-700 hover:text-indigo-600 border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors"
                        >
                            <RefreshCw size={18} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={handleExportExcel}
                            disabled={exporting}
                            className="px-4 py-2 min-h-[42px] bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-700 transition-colors"
                        >
                            {exporting ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Download size={16} aria-hidden="true" />}
                            Export Excel
                        </button>
                    </div>
                </section>

                <section aria-label="Data std_area_matrix" className="bg-white rounded-2xl shadow-xs border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-600 flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-indigo-600" size={28} aria-hidden="true" />
                            <span className="text-sm font-medium">Memuat data mapping std_area_matrix...</span>
                        </div>
                    ) : viewMode === 'users' ? (
                        groupedUsers.length === 0 ? (
                            <div className="p-12 text-center space-y-3">
                                <Users size={36} aria-hidden="true" className="mx-auto text-gray-400" />
                                <p className="font-semibold text-gray-800 text-base">
                                    Tidak ada data mapping RSM / ASM yang sesuai filter
                                </p>
                                <p className="text-xs text-gray-600 max-w-md mx-auto">
                                    Ubah kata kunci pencarian atau filter Zone/Kategori, atau tambahkan mapping baru untuk RSM dan ASM.
                                </p>
                                <div className="flex justify-center gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={resetFilters}
                                        className="px-4 py-2 min-h-[42px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm"
                                    >
                                        Reset Filter
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenUserMappingModal()}
                                        className="px-4 py-2 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm"
                                    >
                                        Tambah Mapping RSM / ASM
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                        <tr>
                                            <th className="py-3.5 px-3 w-10">
                                                <span className="sr-only">Detail baris</span>
                                            </th>
                                            <th className="py-3.5 px-4">User (RSM / ASM)</th>
                                            <th className="py-3.5 px-4">Kategori & Dept</th>
                                            <th className="py-3.5 px-4">Zone Tercakup</th>
                                            <th className="py-3.5 px-4">Mapping Distributor (ShipToRD)</th>
                                            <th className="py-3.5 px-4 text-right">Jumlah Rules</th>
                                            <th className="py-3.5 px-4 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {groupedUsers.map((u) => {
                                            const isExpanded = expandedEmails.has(u.email);
                                            const badge = MAPPING_BADGE_STYLES[u.mapping_type] || MAPPING_BADGE_STYLES.ASM;
                                            return (
                                                <React.Fragment key={u.email}>
                                                    <tr className="hover:bg-gray-50/70 align-top transition-colors">
                                                        <td className="py-3.5 px-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpandUser(u.email)}
                                                                aria-expanded={isExpanded}
                                                                aria-label={`${isExpanded ? 'Sembunyikan' : 'Tampilkan'} rincian baris std_area_matrix untuk ${u.email}`}
                                                                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                                            >
                                                                {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                                                            </button>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="font-semibold text-gray-900">
                                                                {u.name || u.email}
                                                            </div>
                                                            <div className="font-mono text-xs text-gray-600 break-all">
                                                                {u.email}
                                                            </div>
                                                            {(u.remarks || u.manager_email) && (
                                                                <div className="text-xs text-gray-600 mt-1">
                                                                    {u.remarks ? <span className="font-medium text-gray-700">{u.remarks}</span> : null}
                                                                    {u.remarks && u.manager_email ? ' · ' : null}
                                                                    {u.manager_email ? <span>Mgr: {u.manager_name || u.manager_email}</span> : null}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${badge.className}`}>
                                                                {badge.label}
                                                            </span>
                                                            <div className="text-xs text-gray-600 mt-1">
                                                                Dept: <span className="font-medium text-gray-800">{u.department || '-'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            {u.zones.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {u.zones.map((z) => (
                                                                        <span
                                                                            key={z}
                                                                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300"
                                                                        >
                                                                            {z}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-gray-600">-</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <div className="flex flex-wrap gap-1.5 max-w-md">
                                                                {u.rows.slice(0, 6).map((r) => {
                                                                    const isEx = r.operator === 'EX';
                                                                    const isAll = r.shiptord.toUpperCase() === 'ALL';
                                                                    return (
                                                                        <span
                                                                            key={r.id}
                                                                            title={`${r.operator}: ${r.shiptord} (${r.rd_desc || r.dist_name || '-'})`}
                                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${isEx
                                                                                ? 'bg-red-50 text-red-800 border-red-200'
                                                                                : isAll
                                                                                    ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                                }`}
                                                                        >
                                                                            <span className="font-mono font-bold">{r.operator}</span>
                                                                            <span>:</span>
                                                                            <span className="font-mono">{r.shiptord}</span>
                                                                            {isAll && r.zone ? <span>({r.zone})</span> : null}
                                                                        </span>
                                                                    );
                                                                })}
                                                                {u.rows.length > 6 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleExpandUser(u.email)}
                                                                        className="px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300"
                                                                    >
                                                                        +{u.rows.length - 6} lainnya
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                            <div className="font-bold text-gray-900 tabular-nums">
                                                                {u.total_rows} Baris
                                                            </div>
                                                            <div className="text-xs text-gray-600 tabular-nums">
                                                                {u.eq_count} EQ{u.ex_count > 0 ? `, ${u.ex_count} EX` : ''}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                            <div className="inline-flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenUserMappingModal(u)}
                                                                    className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors"
                                                                >
                                                                    <Edit size={14} aria-hidden="true" />
                                                                    Kelola
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setDeleteTarget({
                                                                            type: 'user',
                                                                            email: u.email,
                                                                            name: u.name,
                                                                            count: u.total_rows
                                                                        })
                                                                    }
                                                                    aria-label={`Hapus seluruh mapping untuk ${u.email}`}
                                                                    title="Hapus seluruh mapping user"
                                                                    className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 transition-colors"
                                                                >
                                                                    <Trash2 size={16} aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {isExpanded && (
                                                        <tr className="bg-gray-50/90">
                                                            <td colSpan={7} className="px-4 sm:px-8 py-4">
                                                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                                                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                                                                        <span className="text-xs font-bold text-gray-800">
                                                                            Rincian Baris std_area_matrix untuk {u.email} ({u.rows.length} baris)
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setEditingRow(null);
                                                                                setRowForm({
                                                                                    email: u.email,
                                                                                    mode: 'distributor',
                                                                                    zone: u.zones[0] || 'ZONE-1',
                                                                                    shiptord: '',
                                                                                    rd_desc: '',
                                                                                    operator: 'EQ'
                                                                                });
                                                                                ensureOptionsLoaded();
                                                                                setShowRowModal(true);
                                                                            }}
                                                                            className="px-2.5 py-1.5 min-h-[34px] text-xs font-semibold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg inline-flex items-center gap-1"
                                                                        >
                                                                            <Plus size={14} aria-hidden="true" />
                                                                            Tambah Baris ke User Ini
                                                                        </button>
                                                                    </div>
                                                                    <div className="overflow-x-auto">
                                                                        <table className="w-full text-left text-xs">
                                                                            <thead className="bg-gray-50/60 border-b border-gray-200 text-gray-700 font-semibold">
                                                                                <tr>
                                                                                    <th className="py-2 px-3">ID</th>
                                                                                    <th className="py-2 px-3">Zone</th>
                                                                                    <th className="py-2 px-3">Operator</th>
                                                                                    <th className="py-2 px-3">ShipToRD</th>
                                                                                    <th className="py-2 px-3">RD_DESC (std_area_matrix)</th>
                                                                                    <th className="py-2 px-3">Master Distributor (eorder_distributor)</th>
                                                                                    <th className="py-2 px-3 text-right">Aksi Baris</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-100">
                                                                                {u.rows.map((r) => (
                                                                                    <tr key={r.id} className="hover:bg-gray-50">
                                                                                        <td className="py-2 px-3 font-mono text-gray-600">#{r.id}</td>
                                                                                        <td className="py-2 px-3 font-semibold text-gray-800">{r.zone || '-'}</td>
                                                                                        <td className="py-2 px-3">
                                                                                            <span
                                                                                                className={`inline-flex px-2 py-0.5 rounded font-mono font-bold ${r.operator === 'EX'
                                                                                                    ? 'bg-red-50 text-red-800 border border-red-200'
                                                                                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                                                                    }`}
                                                                                            >
                                                                                                {r.operator}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="py-2 px-3 font-mono font-bold text-gray-900">{r.shiptord}</td>
                                                                                        <td className="py-2 px-3 text-gray-800">{r.rd_desc || '-'}</td>
                                                                                        <td className="py-2 px-3 text-gray-700">
                                                                                            {r.shiptord.toUpperCase() === 'ALL' ? (
                                                                                                <span className="text-indigo-800 font-medium">
                                                                                                    Seluruh Distributor pada {r.zone || 'Semua Zone'}
                                                                                                </span>
                                                                                            ) : r.dist_name ? (
                                                                                                <span>
                                                                                                    {r.dist_name} {r.city ? `- ${r.city}` : ''} (DistID: <code className="font-mono">{r.dist_id}</code>)
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="text-gray-600">Tidak terdaftar di master distributor aktif</span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="py-2 px-3 text-right whitespace-nowrap">
                                                                                            <div className="inline-flex gap-1">
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => handleOpenRowModal({ ...r, mapping_type: u.mapping_type })}
                                                                                                    aria-label={`Edit baris #${r.id}`}
                                                                                                    className="p-1.5 text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md"
                                                                                                >
                                                                                                    <Edit size={14} aria-hidden="true" />
                                                                                                </button>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => setDeleteTarget({ type: 'row', row: r })}
                                                                                                    aria-label={`Hapus baris #${r.id}`}
                                                                                                    className="p-1.5 text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-md"
                                                                                                >
                                                                                                    <Trash2 size={14} aria-hidden="true" />
                                                                                                </button>
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : flatRows.length === 0 ? (
                        <div className="p-12 text-center space-y-3">
                            <Table size={36} aria-hidden="true" className="mx-auto text-gray-400" />
                            <p className="font-semibold text-gray-800 text-base">
                                Tidak ada baris std_area_matrix yang ditemukan
                            </p>
                            <p className="text-xs text-gray-600 max-w-md mx-auto">
                                Silakan atur ulang filter pencarian atau tambahkan baris baru ke tabel std_area_matrix.
                            </p>
                            <div className="flex justify-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="px-4 py-2 min-h-[42px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm"
                                >
                                    Reset Filter
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOpenRowModal()}
                                    className="px-4 py-2 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm"
                                >
                                    Tambah Baris Matrix
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                    <tr>
                                        <th className="py-3.5 px-4">ID</th>
                                        <th className="py-3.5 px-4">Email & Nama User</th>
                                        <th className="py-3.5 px-4">Kategori</th>
                                        <th className="py-3.5 px-4">Zone</th>
                                        <th className="py-3.5 px-4">Operator</th>
                                        <th className="py-3.5 px-4">ShipToRD</th>
                                        <th className="py-3.5 px-4">RD_DESC & Master Distributor</th>
                                        <th className="py-3.5 px-4 text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {flatRows.map((r) => {
                                        const badge = MAPPING_BADGE_STYLES[r.mapping_type || 'ASM'] || MAPPING_BADGE_STYLES.ASM;
                                        return (
                                            <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                                                <td className="py-3 px-4 font-mono text-xs text-gray-600">#{r.id}</td>
                                                <td className="py-3 px-4">
                                                    <div className="font-semibold text-gray-900">{r.name || r.email}</div>
                                                    <div className="font-mono text-xs text-gray-600">{r.email}</div>
                                                    {r.department && (
                                                        <div className="text-xs text-gray-600">Dept: {r.department}</div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${badge.className}`}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-gray-800 whitespace-nowrap">
                                                    {r.zone || '-'}
                                                </td>
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${r.operator === 'EX'
                                                            ? 'bg-red-50 text-red-800 border-red-200'
                                                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                            }`}
                                                    >
                                                        {r.operator} {r.operator === 'EX' ? '(Exclude)' : '(Include)'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 font-mono font-bold text-gray-900 whitespace-nowrap">
                                                    {r.shiptord}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="font-medium text-gray-900">{r.rd_desc || '-'}</div>
                                                    {r.dist_name && (
                                                        <div className="text-xs text-gray-600">
                                                            Master RD: {r.dist_name} {r.city ? `(${r.city})` : ''} · DistID {r.dist_id}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenRowModal(r)}
                                                            aria-label={`Edit baris #${r.id}`}
                                                            title="Edit baris"
                                                            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                                        >
                                                            <Edit size={16} aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget({ type: 'row', row: r })}
                                                            aria-label={`Hapus baris #${r.id}`}
                                                            title="Hapus baris"
                                                            className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                                                        >
                                                            <Trash2 size={16} aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            {showUserMappingModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 overflow-y-auto"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowUserMappingModal(false);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="user-mapping-modal-title"
                        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden"
                    >
                        <div className="bg-indigo-600 px-5 py-4 text-white flex items-center justify-between gap-3">
                            <div>
                                <h2 id="user-mapping-modal-title" className="font-bold text-base">
                                    {editingUserEmail
                                        ? `Kelola Mapping Area: ${editingUserEmail}`
                                        : 'Tambah Mapping Area RSM / ASM Baru'}
                                </h2>
                                <p className="text-xs text-indigo-100 mt-0.5">
                                    Atur cakupan Zone (RSM) atau pilih daftar Distributor Ship-To (ASM) pada tabel std_area_matrix
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowUserMappingModal(false)}
                                aria-label="Tutup dialog mapping user"
                                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-white/90 hover:text-white hover:bg-white/15 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveUserMapping} className="flex-1 overflow-y-auto p-5 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div>
                                    <label htmlFor="target-user-email" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                        Email User (RSM / ASM)
                                    </label>
                                    <input
                                        id="target-user-email"
                                        type="email"
                                        required
                                        value={targetEmail}
                                        onChange={(e) => setTargetEmail(e.target.value)}
                                        placeholder="nama.user@ceresnl.com"
                                        className="w-full px-3.5 py-2 min-h-[42px] bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                    />
                                    <p className="text-xs text-gray-600 mt-1">
                                        Ketik langsung email user atau pilih dari daftar User Matrix di sebelah kanan.
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="candidate-user-search" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                        Pilih Cepat dari User Matrix
                                    </label>
                                    <input
                                        id="candidate-user-search"
                                        type="text"
                                        value={userPickerSearch}
                                        onChange={(e) => setUserPickerSearch(e.target.value)}
                                        placeholder="Cari nama, email, atau regional..."
                                        className="w-full px-3 py-1.5 min-h-[38px] bg-white border border-gray-300 rounded-lg text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 mb-1.5"
                                    />
                                    <div className="max-h-28 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                                        {filteredCandidateUsers.map((cu) => (
                                            <button
                                                key={cu.email}
                                                type="button"
                                                onClick={() => {
                                                    setTargetEmail(cu.email);
                                                    setBuilderTab(cu.suggested_type === 'RSM' ? 'rsm_zone' : 'asm_dist');
                                                }}
                                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 flex items-center justify-between gap-2 ${targetEmail.toLowerCase() === cu.email.toLowerCase()
                                                    ? 'bg-indigo-50 font-semibold text-indigo-900'
                                                    : 'text-gray-800'
                                                    }`}
                                            >
                                                <span className="truncate">
                                                    {cu.name ? `${cu.name} (${cu.email})` : cu.email}
                                                </span>
                                                <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                                                    {cu.remarks || cu.department || cu.suggested_type}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2" role="tablist" aria-label="Pilih metode penambahan mapping">
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={builderTab === 'rsm_zone'}
                                        onClick={() => setBuilderTab('rsm_zone')}
                                        className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${builderTab === 'rsm_zone'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        1. Mode RSM: Mapping per Zone (ShipToRD = ALL)
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={builderTab === 'asm_dist'}
                                        onClick={() => setBuilderTab('asm_dist')}
                                        className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold uppercase tracking-wider transition-colors ${builderTab === 'asm_dist'
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                    >
                                        2. Mode ASM: Pilih Distributor Spesifik (Ship-To) / Exclude (EX)
                                    </button>
                                </div>

                                {builderTab === 'rsm_zone' ? (
                                    <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                                        <p className="text-xs text-gray-700">
                                            Pilih satu atau beberapa <strong>Zone</strong> untuk memberikan akses ke seluruh distributor aktif pada Zone tersebut (<code className="font-mono">Operator = EQ, ShipToRD = ALL</code>). Jika ada distributor di dalam Zone tersebut yang ingin dikecualikan, buka tab <strong>Mode ASM / Exclude (EX)</strong>.
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                                            {['ZONE-1', 'ZONE-2', 'ZONE-3', 'ZONE-4', 'ZONE-5', 'ZONE-6', 'ZONE-7', 'ZONE-8', 'ZONE-9', 'ALL'].map((z) => {
                                                const isSelected = draftEntries.some(
                                                    (e) => e.zone.toUpperCase() === z && e.shiptord.toUpperCase() === 'ALL' && e.operator === 'EQ'
                                                );
                                                const rdCount = zoneDistCounts[z] || 0;
                                                return (
                                                    <button
                                                        key={z}
                                                        type="button"
                                                        onClick={() => toggleZoneAllEntry(z)}
                                                        aria-pressed={isSelected}
                                                        className={`p-3 min-h-[48px] rounded-xl border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${isSelected
                                                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                                                            : 'bg-white text-gray-800 border-gray-300 hover:border-indigo-400'
                                                            }`}
                                                    >
                                                        <div className="font-bold text-xs flex items-center justify-between">
                                                            <span>{z}</span>
                                                            {isSelected && <CheckCircle2 size={14} aria-hidden="true" />}
                                                        </div>
                                                        <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-gray-600'}`}>
                                                            {z === 'ALL' ? 'Semua Zone' : `${rdCount} RD aktif`}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/70 space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div>
                                                <label htmlFor="modal-dist-zone" className="block text-xs font-semibold text-gray-700 mb-1">
                                                    Filter Zone Distributor
                                                </label>
                                                <select
                                                    id="modal-dist-zone"
                                                    value={modalDistZoneFilter}
                                                    onChange={(e) => setModalDistZoneFilter(e.target.value)}
                                                    className="w-full px-3 py-2 min-h-[40px] bg-white border border-gray-300 rounded-lg text-xs text-gray-900"
                                                >
                                                    <option value="">Semua Zone ({distributorOptions.length} RD)</option>
                                                    {['ZONE-1', 'ZONE-2', 'ZONE-3', 'ZONE-4', 'ZONE-5', 'ZONE-6', 'ZONE-7', 'ZONE-8', 'ZONE-9'].map((z) => (
                                                        <option key={z} value={z}>
                                                            {z} ({zoneDistCounts[z] || 0} RD)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label htmlFor="modal-dist-search" className="block text-xs font-semibold text-gray-700 mb-1">
                                                    Cari Nama RD / Ship-To / Kota
                                                </label>
                                                <input
                                                    id="modal-dist-search"
                                                    type="text"
                                                    value={modalDistSearch}
                                                    onChange={(e) => setModalDistSearch(e.target.value)}
                                                    placeholder="Contoh: BORWITA, 1000104, SURABAYA..."
                                                    className="w-full px-3 py-2 min-h-[40px] bg-white border border-gray-300 rounded-lg text-xs text-gray-900 placeholder-gray-500"
                                                />
                                            </div>

                                            <div>
                                                <label htmlFor="modal-dist-op" className="block text-xs font-semibold text-gray-700 mb-1">
                                                    Operator Saat Memilih
                                                </label>
                                                <select
                                                    id="modal-dist-op"
                                                    value={modalDistOperator}
                                                    onChange={(e) => setModalDistOperator(e.target.value as 'EQ' | 'EX')}
                                                    className="w-full px-3 py-2 min-h-[40px] bg-white border border-gray-300 rounded-lg text-xs text-gray-900 font-semibold"
                                                >
                                                    <option value="EQ">EQ - Include Distributor (ASM)</option>
                                                    <option value="EX">EX - Exclude Distributor</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-gray-700">
                                            <span>
                                                Menampilkan <strong>{filteredModalDistributors.length}</strong> distributor aktif
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleSelectAllFilteredDistributors}
                                                disabled={filteredModalDistributors.length === 0}
                                                className="px-3 py-1.5 min-h-[34px] bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-lg font-semibold disabled:opacity-50"
                                            >
                                                Tambahkan Semua Hasil Filter ({filteredModalDistributors.length})
                                            </button>
                                        </div>

                                        <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
                                            {filteredModalDistributors.length === 0 ? (
                                                <div className="p-6 text-center text-xs text-gray-600">
                                                    Tidak ada distributor yang cocok dengan filter di atas.
                                                </div>
                                            ) : (
                                                filteredModalDistributors.map((dist) => {
                                                    const matchedEntry = draftEntries.find((e) => e.shiptord === dist.ship_to);
                                                    const isChecked = !!matchedEntry && matchedEntry.operator === modalDistOperator;
                                                    return (
                                                        <label
                                                            key={`${dist.dist_id}_${dist.ship_to}`}
                                                            className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-gray-50 text-xs"
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => toggleDistributorEntry(dist, modalDistOperator)}
                                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-600 shrink-0"
                                                                />
                                                                <div className="truncate">
                                                                    <span className="font-semibold text-gray-900">{dist.dist_name}</span>
                                                                    {dist.city ? <span className="text-gray-600"> - {dist.city}</span> : null}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                {matchedEntry && (
                                                                    <span
                                                                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${matchedEntry.operator === 'EX'
                                                                            ? 'bg-red-100 text-red-800'
                                                                            : 'bg-emerald-100 text-emerald-800'
                                                                            }`}
                                                                    >
                                                                        {matchedEntry.operator}
                                                                    </span>
                                                                )}
                                                                <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                                                                    {dist.zone || '-'}
                                                                </span>
                                                                <code className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                                                    {dist.ship_to}
                                                                </code>
                                                            </div>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                                        Daftar Baris Mapping yang Akan Disimpan ({draftEntries.length} baris)
                                    </h3>
                                    {draftEntries.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setDraftEntries([])}
                                            className="text-xs font-semibold text-red-700 hover:underline"
                                        >
                                            Kosongkan Semua Pilihan
                                        </button>
                                    )}
                                </div>

                                {draftEntries.length === 0 ? (
                                    <div className="p-6 border border-dashed border-gray-300 rounded-xl text-center text-xs text-gray-600 bg-gray-50">
                                        Belum ada Zone atau Distributor yang dipilih. Gunakan panel di atas untuk memilih cakupan area.
                                    </div>
                                ) : (
                                    <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold sticky top-0">
                                                <tr>
                                                    <th className="py-2 px-3">Zone</th>
                                                    <th className="py-2 px-3">Operator</th>
                                                    <th className="py-2 px-3">ShipToRD</th>
                                                    <th className="py-2 px-3">RD_DESC</th>
                                                    <th className="py-2 px-3 text-right">Hapus</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {draftEntries.map((entry, idx) => (
                                                    <tr key={`${entry.zone}_${entry.shiptord}_${entry.operator}_${idx}`}>
                                                        <td className="py-2 px-3 font-semibold text-gray-800">{entry.zone}</td>
                                                        <td className="py-2 px-3">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setDraftEntries((prev) =>
                                                                        prev.map((item, i) =>
                                                                            i === idx
                                                                                ? { ...item, operator: item.operator === 'EQ' ? 'EX' : 'EQ' }
                                                                                : item
                                                                        )
                                                                    )
                                                                }
                                                                title="Klik untuk mengganti EQ / EX"
                                                                className={`px-2 py-0.5 rounded font-mono font-bold border ${entry.operator === 'EX'
                                                                    ? 'bg-red-50 text-red-800 border-red-200'
                                                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                    }`}
                                                            >
                                                                {entry.operator}
                                                            </button>
                                                        </td>
                                                        <td className="py-2 px-3 font-mono font-bold text-gray-900">{entry.shiptord}</td>
                                                        <td className="py-2 px-3 text-gray-700">{entry.rd_desc || 'ALL'}</td>
                                                        <td className="py-2 px-3 text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setDraftEntries((prev) => prev.filter((_, i) => i !== idx))
                                                                }
                                                                aria-label={`Hapus ${entry.shiptord} dari daftar`}
                                                                className="p-1 text-gray-600 hover:text-red-700 rounded"
                                                            >
                                                                <X size={14} aria-hidden="true" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setShowUserMappingModal(false)}
                                    className="px-4 py-2 min-h-[42px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || draftEntries.length === 0}
                                    className="px-5 py-2 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-xs"
                                >
                                    {saving ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                                    Simpan Mapping ({draftEntries.length} Baris)
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showRowModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowRowModal(false);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="row-modal-title"
                        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
                    >
                        <div className="bg-indigo-600 px-5 py-4 text-white flex items-center justify-between">
                            <h2 id="row-modal-title" className="font-bold text-base">
                                {editingRow
                                    ? `Edit Baris std_area_matrix #${editingRow.id}`
                                    : 'Tambah Baris std_area_matrix'}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowRowModal(false)}
                                aria-label="Tutup dialog baris matrix"
                                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-white/90 hover:text-white hover:bg-white/15 rounded-lg"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveSingleRow} className="p-5 space-y-4">
                            <div>
                                <label htmlFor="row-email-input" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                    Email User (RSM / ASM)
                                </label>
                                <input
                                    id="row-email-input"
                                    type="email"
                                    required
                                    value={rowForm.email}
                                    onChange={(e) => setRowForm({ ...rowForm, email: e.target.value })}
                                    placeholder="nama.user@ceresnl.com"
                                    className="w-full px-3.5 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                                />
                            </div>

                            <div>
                                <span className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                                    Tipe Cakupan Mapping
                                </span>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRowForm({ ...rowForm, mode: 'distributor' })}
                                        className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold border ${rowForm.mode === 'distributor'
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-gray-50 text-gray-800 border-gray-300 hover:bg-gray-100'
                                            }`}
                                    >
                                        Pilih RD (ASM)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setRowForm({
                                                ...rowForm,
                                                mode: 'zone_all',
                                                shiptord: 'ALL',
                                                rd_desc: 'ALL'
                                            })
                                        }
                                        className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold border ${rowForm.mode === 'zone_all'
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-gray-50 text-gray-800 border-gray-300 hover:bg-gray-100'
                                            }`}
                                    >
                                        Seluruh Zone (RSM)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRowForm({ ...rowForm, mode: 'manual' })}
                                        className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold border ${rowForm.mode === 'manual'
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-gray-50 text-gray-800 border-gray-300 hover:bg-gray-100'
                                            }`}
                                    >
                                        Input Manual
                                    </button>
                                </div>
                            </div>

                            {rowForm.mode === 'distributor' && (
                                <div className="space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                    <label htmlFor="row-dist-search" className="block text-xs font-semibold text-gray-700">
                                        Cari & Klik Distributor
                                    </label>
                                    <input
                                        id="row-dist-search"
                                        type="text"
                                        value={rowDistSearch}
                                        onChange={(e) => setRowDistSearch(e.target.value)}
                                        placeholder="Cari nama distributor, Ship-To, atau kota..."
                                        className="w-full px-3 py-1.5 min-h-[38px] bg-white border border-gray-300 rounded-lg text-xs text-gray-900"
                                    />
                                    <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                                        {filteredRowDistributors.map((d) => (
                                            <button
                                                key={`${d.dist_id}_${d.ship_to}`}
                                                type="button"
                                                onClick={() =>
                                                    setRowForm({
                                                        ...rowForm,
                                                        zone: d.zone || 'ALL',
                                                        shiptord: d.ship_to,
                                                        rd_desc: d.rd_desc || d.dist_name
                                                    })
                                                }
                                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-indigo-50 flex items-center justify-between gap-2 ${rowForm.shiptord === d.ship_to
                                                    ? 'bg-indigo-50 font-semibold text-indigo-900'
                                                    : 'text-gray-800'
                                                    }`}
                                            >
                                                <span className="truncate">
                                                    {d.dist_name} {d.city ? `- ${d.city}` : ''}
                                                </span>
                                                <span className="shrink-0 font-mono text-indigo-700 font-bold">
                                                    {d.ship_to} ({d.zone})
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="row-zone-select" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                        Zone
                                    </label>
                                    <select
                                        id="row-zone-select"
                                        value={rowForm.zone}
                                        onChange={(e) => setRowForm({ ...rowForm, zone: e.target.value })}
                                        className="w-full px-3 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                                    >
                                        {availableZones.map((z) => (
                                            <option key={z} value={z}>{z}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="row-operator-select" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                        Operator
                                    </label>
                                    <select
                                        id="row-operator-select"
                                        value={rowForm.operator}
                                        onChange={(e) => setRowForm({ ...rowForm, operator: e.target.value as 'EQ' | 'EX' })}
                                        className="w-full px-3 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                                    >
                                        <option value="EQ">EQ (Include)</option>
                                        <option value="EX">EX (Exclude)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="row-shipto-input" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                        ShipToRD
                                    </label>
                                    <input
                                        id="row-shipto-input"
                                        type="text"
                                        required
                                        readOnly={rowForm.mode === 'zone_all'}
                                        value={rowForm.mode === 'zone_all' ? 'ALL' : rowForm.shiptord}
                                        onChange={(e) => setRowForm({ ...rowForm, shiptord: e.target.value })}
                                        placeholder="Kode Ship-To atau ALL"
                                        className="w-full px-3.5 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white read-only:bg-gray-100"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="row-rddesc-input" className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">
                                        RD_DESC
                                    </label>
                                    <input
                                        id="row-rddesc-input"
                                        type="text"
                                        value={rowForm.rd_desc}
                                        onChange={(e) => setRowForm({ ...rowForm, rd_desc: e.target.value })}
                                        placeholder="Otomatis dari master RD jika kosong"
                                        className="w-full px-3.5 py-2 min-h-[42px] bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setShowRowModal(false)}
                                    className="px-4 py-2 min-h-[42px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 min-h-[42px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-xs"
                                >
                                    {saving ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                                    {editingRow ? 'Simpan Perubahan' : 'Tambah Baris'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setDeleteTarget(null);
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-modal-title"
                        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center space-y-4"
                    >
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-700">
                            <Trash2 size={24} aria-hidden="true" />
                        </div>
                        <div>
                            <h2 id="delete-modal-title" className="text-lg font-bold text-gray-900">
                                {deleteTarget.type === 'user'
                                    ? 'Hapus Seluruh Mapping User'
                                    : 'Hapus Baris std_area_matrix'}
                            </h2>
                            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                                {deleteTarget.type === 'user' ? (
                                    <>
                                        Apakah Anda yakin ingin menghapus seluruh <strong>{deleteTarget.count} baris</strong> mapping di <code className="font-mono">std_area_matrix</code> untuk user <strong>{deleteTarget.email}</strong>?
                                    </>
                                ) : (
                                    <>
                                        Apakah Anda yakin ingin menghapus baris <strong>#{deleteTarget.row.id}</strong> (<code className="font-mono">{deleteTarget.row.email}</code> - Zone <strong>{deleteTarget.row.zone || '-'}</strong> - ShipToRD <strong>{deleteTarget.row.shiptord}</strong>)?
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="flex justify-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 min-h-[42px] bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={saving}
                                className="px-5 py-2 min-h-[42px] bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-medium rounded-xl text-sm flex items-center gap-2 shadow-xs"
                            >
                                {saving ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Trash2 size={16} aria-hidden="true" />}
                                Ya, Hapus
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
