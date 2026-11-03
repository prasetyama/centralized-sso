import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchEOrderUserStats } from '../api/api';
import {
    AlertCircle,
    ChevronDown,
    ChevronRight,
    Loader2,
    MapPin,
    RefreshCw,
    Search,
    Users,
    X
} from 'lucide-react';

type OrderRow = {
    filename: string;
    po_number: string | null;
    periode: string | null;
    order_type: string | null;
    principal: string | null;
    total_qty: number;
    line_count: number;
    submitted_at: string | null;
    release_flag: string | null;
    approval_status: string | null;
};

type ShipToRow = {
    shiptord: string;
    zone: string | null;
    rd_desc: string | null;
    users: { id: number; username: string; email: string | null }[];
    dist_id: string | null;
    dist_name: string | null;
    city: string | null;
    submitted: boolean;
    po_count: number;
    total_qty: number;
    last_submitted_at: string | null;
    orders: OrderRow[];
};

type StatsResponse = {
    periode: string;
    available_periodes: string[];
    total_users: number;
    total_shipto: number;
    submitted_shipto: number;
    not_submitted_shipto: number;
    shiptos: ShipToRow[];
};

type DetailFilter = 'all' | 'submitted' | 'not_submitted';

const ORDER_TYPE_LABELS: Record<string, string> = {
    '1': 'Fix Order',
    '2': 'Additional Order',
    '3': 'Urgent Order'
};

const currentPeriode = () => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatPeriode = (periode: string) => {
    if (periode === 'all') return 'all periodes';
    if (!/^\d{6}$/.test(periode)) return periode;
    const date = new Date(Number(periode.slice(0, 4)), Number(periode.slice(4, 6)) - 1, 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : '-');

const approvalBadgeClass = (flag: string | null) => {
    if (flag === '3' || flag === '5') return 'bg-red-50 text-red-700 border-red-200';
    if (flag === '4' || flag === '99') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (flag === '2') return 'bg-sky-50 text-sky-700 border-sky-200';
    return 'bg-amber-50 text-amber-800 border-amber-200';
};

export const EOrderSubmissionStats = ({ token }: { token: string | null }) => {
    const [periode, setPeriode] = useState(currentPeriode());
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);

    const loadStats = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchEOrderUserStats(token, periode);
            setStats(data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Could not load submission stats. Check the SSO backend connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, periode]);

    const periodeOptions = useMemo(() => {
        const set = new Set<string>([currentPeriode(), periode, ...(stats?.available_periodes || [])]);
        set.delete('all');
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [stats, periode]);

    const submittedPct = stats && stats.total_shipto > 0
        ? Math.round((stats.submitted_shipto / stats.total_shipto) * 100)
        : 0;

    return (
        <section aria-labelledby="submission-stats-title" className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                    <h2 id="submission-stats-title" className="text-base font-bold text-gray-800">Order submission by Ship-To</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Ship-To mapped to E-Order users, checked against submitted orders for {formatPeriode(periode)}.
                    </p>
                </div>
                <div className="flex items-end gap-2">
                    <div>
                        <label htmlFor="stats-periode" className="block text-[11px] font-semibold text-gray-600 mb-1">Periode</label>
                        <select
                            id="stats-periode"
                            value={periode}
                            onChange={(e) => setPeriode(e.target.value)}
                            className="px-3 py-2 min-h-[40px] bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                            {periodeOptions.map((p) => (
                                <option key={p} value={p}>{formatPeriode(p)}</option>
                            ))}
                            <option value="all">All periodes</option>
                        </select>
                    </div>
                    <button
                        onClick={loadStats}
                        disabled={loading}
                        aria-label="Refresh submission stats"
                        className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors cursor-pointer"
                    >
                        <RefreshCw size={18} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="p-4 sm:p-5">
                {error ? (
                    <div role="alert" className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <AlertCircle size={18} aria-hidden="true" className="shrink-0 mt-0.5 text-red-500" />
                            <span className="text-sm">{error}</span>
                        </div>
                        <button
                            onClick={loadStats}
                            className="px-3 py-2 text-sm font-medium bg-white border border-red-200 rounded-xl hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                ) : !stats && loading ? (
                    <div className="py-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                        <Loader2 size={18} aria-hidden="true" className="animate-spin text-indigo-600" />
                        Loading submission stats for {formatPeriode(periode)}...
                    </div>
                ) : stats ? (
                    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        {/* Total users: informational, the user list below is its detail */}
                        <div className="rounded-xl border border-gray-200 p-4">
                            <div className="flex items-center gap-2 text-gray-600 text-xs font-semibold">
                                <Users size={16} aria-hidden="true" />
                                E-Order users
                            </div>
                            <p className="text-3xl font-bold text-gray-900 mt-2 tabular-nums">{stats.total_users.toLocaleString()}</p>
                            <p className="text-xs text-gray-500 mt-1">Accounts with role user_eorder</p>
                        </div>

                        {/* Total mapped Ship-To: opens the full list */}
                        <button
                            onClick={() => setDetailFilter('all')}
                            disabled={stats.total_shipto === 0}
                            className="text-left rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors cursor-pointer"
                        >
                            <span className="flex items-center gap-2 text-gray-600 text-xs font-semibold">
                                <MapPin size={16} aria-hidden="true" />
                                Mapped RD / Ship-To
                            </span>
                            <span className="block text-3xl font-bold text-gray-900 mt-2 tabular-nums">{stats.total_shipto.toLocaleString()}</span>
                            <span className="block text-xs text-gray-500 mt-1">
                                {stats.total_shipto > 0 ? 'Distinct ShipToRD in std_area_matrix. Click for the list.' : 'No Ship-To mapped yet'}
                            </span>
                        </button>

                        {/* Submission progress: the primary metric of this panel */}
                        <div className="sm:col-span-2 lg:col-span-1 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col">
                            {stats.total_shipto === 0 ? (
                                <div className="text-sm text-gray-600 my-auto">
                                    No Ship-To is mapped to an E-Order user yet, so there is nothing to track. Map Ship-To areas from Create User, Edit User, or Import CSV.
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                        <p className="text-xs font-semibold text-indigo-900">Submitted, {formatPeriode(stats.periode)}</p>
                                        <p className="text-xs font-semibold text-indigo-900 tabular-nums">{submittedPct}%</p>
                                    </div>
                                    <p className="mt-2 text-gray-900">
                                        <span className="text-3xl font-bold tabular-nums">{stats.submitted_shipto.toLocaleString()}</span>
                                        <span className="text-sm text-gray-600"> of {stats.total_shipto.toLocaleString()} Ship-To</span>
                                    </p>
                                    <div
                                        className="mt-3 h-2.5 w-full rounded-full bg-white border border-indigo-100 overflow-hidden"
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={stats.total_shipto}
                                        aria-valuenow={stats.submitted_shipto}
                                        aria-label="Ship-To that submitted an order"
                                    >
                                        <div className="h-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${submittedPct}%` }} />
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setDetailFilter('submitted')}
                                            className="px-3 py-2 min-h-[40px] text-sm font-medium rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600 transition-colors cursor-pointer"
                                        >
                                            View {stats.submitted_shipto} submitted
                                        </button>
                                        <button
                                            onClick={() => setDetailFilter('not_submitted')}
                                            className="px-3 py-2 min-h-[40px] text-sm font-medium rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors cursor-pointer"
                                        >
                                            View {stats.not_submitted_shipto} not submitted
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>

            {detailFilter && stats && (
                <SubmissionDetailModal
                    stats={stats}
                    initialFilter={detailFilter}
                    onClose={() => setDetailFilter(null)}
                />
            )}
        </section>
    );
};

const SubmissionDetailModal = ({
    stats,
    initialFilter,
    onClose
}: {
    stats: StatsResponse;
    initialFilter: DetailFilter;
    onClose: () => void;
}) => {
    const [filter, setFilter] = useState<DetailFilter>(initialFilter);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        closeBtnRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return stats.shiptos.filter((s) => {
            if (filter === 'submitted' && !s.submitted) return false;
            if (filter === 'not_submitted' && s.submitted) return false;
            if (!q) return true;
            return [s.shiptord, s.dist_id, s.dist_name, s.rd_desc, s.city, s.zone, ...s.users.map((u) => u.username)]
                .some((v) => v && v.toLowerCase().includes(q));
        });
    }, [stats, filter, query]);

    const toggleRow = (code: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return next;
        });
    };

    const tabs: { key: DetailFilter; label: string; count: number }[] = [
        { key: 'all', label: 'All', count: stats.total_shipto },
        { key: 'submitted', label: 'Submitted', count: stats.submitted_shipto },
        { key: 'not_submitted', label: 'Not submitted', count: stats.not_submitted_shipto }
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="submission-detail-title"
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            >
                <div className="p-4 sm:p-5 border-b border-gray-200 flex items-start justify-between gap-3">
                    <div>
                        <h3 id="submission-detail-title" className="text-base font-bold text-gray-800">
                            Ship-To submission detail, {formatPeriode(stats.periode)}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Status is tracked per DistID, so Ship-To under the same distributor share one status.
                        </p>
                    </div>
                    <button
                        ref={closeBtnRef}
                        onClick={onClose}
                        aria-label="Close submission detail"
                        className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div role="tablist" aria-label="Filter by submission status" className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                role="tab"
                                aria-selected={filter === t.key}
                                onClick={() => setFilter(t.key)}
                                className={`px-3 py-2 min-h-[40px] text-sm font-medium rounded-lg whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors cursor-pointer ${filter === t.key
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                {t.label} <span className="tabular-nums text-gray-500">({t.count})</span>
                            </button>
                        ))}
                    </div>
                    <div className="relative w-full md:w-72">
                        <label htmlFor="submission-search" className="sr-only">Search Ship-To, distributor, or username</label>
                        <Search size={16} aria-hidden="true" className="absolute left-3 top-3 text-gray-400" />
                        <input
                            id="submission-search"
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search Ship-To, distributor, user..."
                            className="w-full pl-9 pr-3 py-2 min-h-[40px] bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                        />
                    </div>
                </div>

                <div className="overflow-auto flex-1">
                    {rows.length === 0 ? (
                        <div className="p-12 text-center text-sm text-gray-500">
                            {query
                                ? `No Ship-To matches "${query}" in this tab. Clear the search or switch tabs.`
                                : filter === 'submitted'
                                    ? `No mapped Ship-To has submitted an order for ${formatPeriode(stats.periode)} yet.`
                                    : filter === 'not_submitted'
                                        ? `Every mapped Ship-To has submitted an order for ${formatPeriode(stats.periode)}.`
                                        : 'No Ship-To is mapped to an E-Order user yet.'}
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600 sticky top-0 z-10">
                                <tr>
                                    <th className="py-3 px-4 w-10"><span className="sr-only">Expand</span></th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Ship-To</th>
                                    <th className="py-3 px-4">Distributor</th>
                                    <th className="py-3 px-4">Zone</th>
                                    <th className="py-3 px-4">Users</th>
                                    <th className="py-3 px-4 text-right">PO</th>
                                    <th className="py-3 px-4 text-right">Qty</th>
                                    <th className="py-3 px-4">Last submitted</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((s) => {
                                    const isOpen = expanded.has(s.shiptord);
                                    return (
                                        <React.Fragment key={s.shiptord}>
                                            <tr className="hover:bg-gray-50/60 align-top">
                                                <td className="py-3 px-4">
                                                    {s.submitted && (
                                                        <button
                                                            onClick={() => toggleRow(s.shiptord)}
                                                            aria-expanded={isOpen}
                                                            aria-label={`${isOpen ? 'Hide' : 'Show'} orders for Ship-To ${s.shiptord}`}
                                                            className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                                                        >
                                                            {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    {s.submitted ? (
                                                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">Submitted</span>
                                                    ) : (
                                                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">Not submitted</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-800">{s.shiptord}</td>
                                                <td className="py-3 px-4">
                                                    <div className="font-medium text-gray-800">{s.dist_name || s.rd_desc || '-'}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {s.dist_id ? `DistID ${s.dist_id}` : 'Not found in eorder_eorder_distributor'}
                                                        {s.city ? `, ${s.city}` : ''}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-gray-700">{s.zone || '-'}</td>
                                                <td className="py-3 px-4">
                                                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                                                        {s.users.length > 0 ? s.users.map((u) => (
                                                            <span key={u.id} title={u.email || ''} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px]">{u.username}</span>
                                                        )) : <span className="text-xs text-gray-500">-</span>}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right tabular-nums">{s.po_count || '-'}</td>
                                                <td className="py-3 px-4 text-right tabular-nums">{s.submitted ? s.total_qty.toLocaleString() : '-'}</td>
                                                <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{formatDateTime(s.last_submitted_at)}</td>
                                            </tr>
                                            {isOpen && (
                                                <tr className="bg-gray-50/70">
                                                    <td colSpan={9} className="px-4 pb-4 pt-1">
                                                        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
                                                            <table className="w-full text-left text-xs">
                                                                <caption className="sr-only">Submitted orders for Ship-To {s.shiptord}</caption>
                                                                <thead className="text-gray-600 border-b border-gray-100">
                                                                    <tr>
                                                                        <th className="py-2 px-3">PO number</th>
                                                                        <th className="py-2 px-3">File</th>
                                                                        <th className="py-2 px-3">Periode</th>
                                                                        <th className="py-2 px-3">Type</th>
                                                                        <th className="py-2 px-3">Principal</th>
                                                                        <th className="py-2 px-3 text-right">SKU lines</th>
                                                                        <th className="py-2 px-3 text-right">Qty</th>
                                                                        <th className="py-2 px-3">Submitted at</th>
                                                                        <th className="py-2 px-3">Approval</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {s.orders.map((o) => (
                                                                        <tr key={o.filename}>
                                                                            <td className="py-2 px-3 font-mono text-gray-800">{o.po_number || '-'}</td>
                                                                            <td className="py-2 px-3 font-mono text-gray-600">{o.filename}</td>
                                                                            <td className="py-2 px-3">{o.periode || '-'}</td>
                                                                            <td className="py-2 px-3">{(o.order_type && ORDER_TYPE_LABELS[o.order_type]) || o.order_type || '-'}</td>
                                                                            <td className="py-2 px-3">{o.principal || '-'}</td>
                                                                            <td className="py-2 px-3 text-right tabular-nums">{o.line_count}</td>
                                                                            <td className="py-2 px-3 text-right tabular-nums">{o.total_qty.toLocaleString()}</td>
                                                                            <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(o.submitted_at)}</td>
                                                                            <td className="py-2 px-3">
                                                                                {o.approval_status ? (
                                                                                    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap ${approvalBadgeClass(o.release_flag)}`}>
                                                                                        {o.approval_status}
                                                                                    </span>
                                                                                ) : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="px-4 sm:px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span className="tabular-nums">Showing {rows.length} of {stats.total_shipto} Ship-To</span>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 min-h-[40px] bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 font-medium rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
