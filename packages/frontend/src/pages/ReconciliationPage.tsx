import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ChevronUp, ChevronDown, CheckSquare, Square, CheckCheck, XCircle, Flag, MessageSquare } from 'lucide-react';
import api from '../lib/api';
import { formatINR, formatDateTime, formatAmountDelta, formatTimeDelta, MATCH_TYPE_CONFIG } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfidenceBar } from '../components/ui/ConfidenceBar';
import { SourceBadge } from '../components/ui/SourceBadge';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import type { ReconciliationResult, PaginatedResponse } from '../types';

const MATCH_TYPE_OPTIONS = ['EXACT', 'FUZZY', 'PARTIAL', 'DUPLICATE', 'UNMATCHED_PAYMENT', 'UNMATCHED_ORDER', 'DELAYED'];
const STATUS_OPTIONS_RECON = ['AUTO_MATCHED', 'FLAGGED', 'MANUALLY_RESOLVED', 'IGNORED'];

// ─── Detail Panel (right side) ────────────────────────────────────────────────
function ReconDetailPanel({ result, onResolve }: {
  result: ReconciliationResult | null;
  onResolve: (id: string, status: string, notes?: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-10">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
          <CheckCheck size={24} className="text-indigo-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">Select an item to review</p>
        <p className="text-xs text-slate-400 mt-2">Click any flagged item from the left panel to see details and take action</p>
      </div>
    );
  }

  const handleAction = async (status: string) => {
    setResolving(true);
    try {
      await onResolve(result.id, status, notes || undefined);
    } finally {
      setResolving(false);
      setNotes('');
    }
  };

  const amtDelta = result.amountDelta;

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <StatusBadge type="matchType" value={result.matchType} size="md" />
          <StatusBadge type="reconStatus" value={result.status} size="md" />
        </div>
        <p className="text-xs text-slate-400 mt-2">{result.notes}</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-5 py-4 text-center">
          <p className="text-[11px] text-slate-400 mb-1">Confidence</p>
          <p className="text-lg font-bold text-slate-900">{result.confidenceScore}%</p>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-[11px] text-slate-400 mb-1">Amount Δ</p>
          <p className={`text-lg font-bold ${amtDelta === 0 ? 'text-slate-900' : amtDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {amtDelta === 0 ? '₹0' : formatAmountDelta(amtDelta)}
          </p>
        </div>
        <div className="px-5 py-4 text-center">
          <p className="text-[11px] text-slate-400 mb-1">Time Δ</p>
          <p className="text-lg font-bold text-slate-900">{formatTimeDelta(result.timeDelta)}</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="px-6 py-4 border-b border-slate-100">
        <p className="text-[11px] text-slate-400 mb-2">Match Confidence</p>
        <ConfidenceBar score={result.confidenceScore} height={8} />
      </div>

      {/* Transaction details */}
      {result.transaction && (
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Payment</p>
          <div className="space-y-2">
            {[
              { label: 'External ID', value: result.transaction.externalId, mono: true },
              { label: 'Source', value: result.transaction.source ? <SourceBadge source={result.transaction.source} /> : '—' },
              { label: 'Amount', value: result.transaction.amount ? formatINR(result.transaction.amount) : '—' },
              { label: 'Timestamp', value: result.transaction.timestamp ? formatDateTime(result.transaction.timestamp) : '—' },
              { label: 'Status', value: result.transaction.status ? <StatusBadge type="txStatus" value={result.transaction.status} /> : '—' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-[11px] text-slate-400">{row.label}</span>
                <span className={`text-xs text-slate-800 ${row.mono ? 'font-mono' : 'font-medium'}`}>{row.value as React.ReactNode}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order details */}
      {result.order && (
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Order</p>
          <div className="space-y-2">
            {[
              { label: 'Order ID', value: result.order.orderId, mono: true },
              { label: 'Customer', value: result.order.customerName },
              { label: 'Amount', value: result.order.amount ? formatINR(result.order.amount) : '—' },
              { label: 'Expected', value: result.order.paymentExpected ? formatDateTime(result.order.paymentExpected) : '—' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-[11px] text-slate-400">{row.label}</span>
                <span className={`text-xs text-slate-800 ${row.mono ? 'font-mono' : 'font-medium'}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes input */}
      {result.status === 'FLAGGED' && (
        <div className="px-6 py-4 border-b border-slate-100">
          <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-2">Resolution Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add context or reason for resolution..."
            rows={3}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-slate-50"
          />
        </div>
      )}

      {/* Already resolved details */}
      {(result.status === 'MANUALLY_RESOLVED' || result.status === 'IGNORED') && result.resolvedAt && (
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Resolution</p>
          <p className="text-xs text-slate-600">{result.notes || 'No notes added'}</p>
          <p className="text-[11px] text-slate-400 mt-1">Resolved {formatRelativeTime(result.resolvedAt)}</p>
        </div>
      )}

      {/* Action buttons */}
      {result.status === 'FLAGGED' && (
        <div className="px-6 py-5 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Actions</p>
          <button onClick={() => handleAction('MANUALLY_RESOLVED')} disabled={resolving}
            className="flex items-center gap-2 w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors btn-press disabled:opacity-70">
            <CheckCheck size={13} /> Accept Match
          </button>
          <button onClick={() => handleAction('IGNORED')} disabled={resolving}
            className="flex items-center gap-2 w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors btn-press disabled:opacity-70">
            <XCircle size={13} /> Mark as Exception
          </button>
          <button onClick={() => handleAction('FLAGGED')} disabled={resolving}
            className="flex items-center gap-2 w-full px-4 py-2.5 border border-amber-300 hover:bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg transition-colors btn-press disabled:opacity-70">
            <Flag size={13} /> Keep Flagged + Add Note
          </button>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ''; }
}

// ─── Reconciliation Page ──────────────────────────────────────────────────────
export function ReconciliationPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>(['FLAGGED']);
  const [selectedResult, setSelectedResult] = useState<ReconciliationResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearch = (val: string) => {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); }, 300);
  };

  const params = new URLSearchParams({
    page: String(page), limit: '25', sortBy, sortDir,
    ...(search ? { search } : {}),
    ...(matchTypeFilter.length ? { matchType: matchTypeFilter.join(',') } : {}),
    ...(statusFilter.length ? { status: statusFilter.join(',') } : {}),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<ReconciliationResult> & { flaggedCount: number }>({
    queryKey: ['reconciliation', params.toString()],
    queryFn: async () => { const { data } = await api.get(`/reconciliation?${params}`); return data; },
    staleTime: 10000,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      api.patch(`/reconciliation/${id}`, { status, notes }),
    onSuccess: (_, vars) => {
      toast.success('Item resolved successfully');
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      if (selectedResult?.id === vars.id) {
        // Update local state optimistically
        setSelectedResult(prev => prev ? { ...prev, status: vars.status as ReconciliationResult['status'], notes: vars.notes } : null);
      }
    },
    onError: () => toast.error('Failed to resolve item'),
  });

  const bulkResolveMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.post('/reconciliation/bulk', { ids, status }),
    onSuccess: (data) => {
      toast.success(`${data.data.updated} items resolved`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    },
    onError: () => toast.error('Bulk resolve failed'),
  });

  const handleResolve = async (id: string, status: string, notes?: string) => {
    resolveMutation.mutate({ id, status, notes });
  };

  const handleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ChevronDown size={10} className="text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUp size={10} className="text-indigo-500" /> : <ChevronDown size={10} className="text-indigo-500" />;
  };

  const toggleSelected = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Flagged list */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-200">
        {/* Filters */}
        <div className="bg-white border-b border-slate-200 p-4 space-y-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={searchInput} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by ID, order, payer..."
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50" />
            </div>
            {data?.flaggedCount !== undefined && (
              <span className="px-3 py-1 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100 rounded-full">
                {data.flaggedCount} flagged
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS_RECON.map(s => (
              <button key={s} onClick={() => {
                setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
                setPage(1);
              }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ${
                  statusFilter.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}
              >{s.replace('_', ' ')}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MATCH_TYPE_OPTIONS.map(t => (
              <button key={t} onClick={() => {
                setMatchTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
                setPage(1);
              }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ${
                  matchTypeFilter.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}
              >{t.replace('_', ' ')}</button>
            ))}
          </div>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-medium text-indigo-700">{selectedIds.size} selected</span>
              <button onClick={() => bulkResolveMutation.mutate({ ids: Array.from(selectedIds), status: 'MANUALLY_RESOLVED' })}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 btn-press">
                Bulk Accept
              </button>
              <button onClick={() => bulkResolveMutation.mutate({ ids: Array.from(selectedIds), status: 'IGNORED' })}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 btn-press">
                Bulk Ignore
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-400 hover:text-slate-600 ml-1">Clear</button>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <SkeletonTable rows={12} cols={5} />
          ) : !data?.data.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCheck size={40} className="text-emerald-400 mb-4" />
              <p className="text-sm font-semibold text-slate-700">All clear!</p>
              <p className="text-xs text-slate-400 mt-1">No items match the current filters</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {data.data.map(result => {
                const config = MATCH_TYPE_CONFIG[result.matchType];
                const isSelected = selectedIds.has(result.id);
                const isActive = selectedResult?.id === result.id;
                return (
                  <div key={result.id}
                    onClick={() => setSelectedResult(result)}
                    className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-indigo-50/50
                      ${isActive ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'border-l-2 border-transparent'}
                    `}
                  >
                    {/* Select checkbox */}
                    <button onClick={e => { e.stopPropagation(); toggleSelected(result.id); }} className="flex-shrink-0">
                      {isSelected ? <CheckSquare size={13} className="text-indigo-600" /> : <Square size={13} className="text-slate-300" />}
                    </button>

                    {/* Severity dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      config?.severity === 'danger' ? 'bg-red-500' :
                      config?.severity === 'warning' ? 'bg-amber-500' :
                      config?.severity === 'success' ? 'bg-emerald-500' : 'bg-slate-300'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge type="matchType" value={result.matchType} />
                        <StatusBadge type="reconStatus" value={result.status} />
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{result.notes}</p>
                      {(result.transaction || result.order) && (
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                          {result.transaction?.externalId || result.order?.orderId}
                        </p>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0 space-y-1">
                      {result.amountDelta !== 0 && (
                        <p className={`text-xs font-semibold ${result.amountDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {formatAmountDelta(result.amountDelta)}
                        </p>
                      )}
                      <ConfidenceBar score={result.confidenceScore} showLabel={false} height={3} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {data?.pagination && (
          <div className="border-t border-slate-100 flex-shrink-0">
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages}
              total={data.pagination.total} limit={data.pagination.limit} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Right: Detail panel */}
      <div className="w-[420px] flex-shrink-0 bg-white overflow-hidden">
        <ReconDetailPanel result={selectedResult} onResolve={handleResolve} />
      </div>
    </div>
  );
}
