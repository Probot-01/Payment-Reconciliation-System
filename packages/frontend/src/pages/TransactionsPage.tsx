import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, Filter, Download, ChevronUp, ChevronDown,
  ExternalLink, CheckSquare, Square
} from 'lucide-react';
import api from '../lib/api';
import { formatINR, formatDateTime, formatAmountDelta, formatTimeDelta } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfidenceBar } from '../components/ui/ConfidenceBar';
import { SourceBadge } from '../components/ui/SourceBadge';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { SlideOver } from '../components/ui/SlideOver';
import type { Transaction, PaginatedResponse } from '../types';

const SOURCE_OPTIONS = ['UPI_GPAY', 'UPI_PHONEPE', 'CARD_VISA', 'CARD_MC', 'WALLET_PAYTM', 'WALLET_AMAZON'];
const STATUS_OPTIONS = ['SUCCESS', 'FAILED', 'PENDING', 'REFUNDED'];
const MATCH_STATUS_OPTIONS = ['UNPROCESSED', 'MATCHED', 'FLAGGED', 'IGNORED'];

// ─── Transaction Detail Panel ─────────────────────────────────────────────────
function TransactionDetail({ txId }: { txId: string }) {
  const { data: tx, isLoading } = useQuery<Transaction>({
    queryKey: ['transaction', txId],
    queryFn: async () => { const { data } = await api.get(`/transactions/${txId}`); return data; },
  });

  const [jsonExpanded, setJsonExpanded] = useState(false);

  if (isLoading) return <div className="p-6 space-y-4">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>;
  if (!tx) return <div className="p-6 text-center text-xs text-slate-500">Transaction not found</div>;

  let rawPayload: Record<string, unknown> = {};
  try { rawPayload = JSON.parse(tx.rawPayload); } catch {}

  return (
    <div className="p-6 space-y-6">
      {/* Status row */}
      <div className="flex items-center gap-2">
        <StatusBadge type="txStatus" value={tx.status} size="md" />
        <StatusBadge type="reconStatus" value={tx.reconciliationStatus} size="md" />
      </div>

      {/* Amount */}
      <div className="bg-slate-50 rounded-xl p-5 text-center border border-slate-100">
        <p className="text-[11px] text-slate-400 mb-1">Transaction Amount</p>
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatINR(tx.amount)}</p>
        <p className="text-xs text-slate-500 mt-1">{tx.currency}</p>
      </div>

      {/* Details grid */}
      <div className="space-y-3">
        {[
          { label: 'External ID', value: tx.externalId, mono: true },
          { label: 'Source', value: <SourceBadge source={tx.source} />, mono: false },
          { label: 'Payer Reference', value: tx.payerRef, mono: true },
          { label: 'Payee Reference', value: tx.payeeRef, mono: true },
          { label: 'Timestamp', value: formatDateTime(tx.timestamp) },
          { label: 'Created At', value: formatDateTime(tx.createdAt) },
        ].map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-4">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">{row.label}</span>
            <span className={`text-xs text-slate-800 text-right ${row.mono ? 'font-mono' : 'font-medium'}`}>
              {row.value as React.ReactNode}
            </span>
          </div>
        ))}
      </div>

      {/* Matched order */}
      {tx.reconciliationResult && (
        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">Reconciliation Result</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-400">Match Type</span>
              <StatusBadge type="matchType" value={tx.reconciliationResult.matchType} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">Confidence</span>
              <ConfidenceBar score={tx.reconciliationResult.confidenceScore} height={6} />
            </div>
            {tx.reconciliationResult.amountDelta !== 0 && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Amount Delta</span>
                <span className={`text-xs font-semibold ${tx.reconciliationResult.amountDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatAmountDelta(tx.reconciliationResult.amountDelta)}
                </span>
              </div>
            )}
            {tx.reconciliationResult.order && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Matched Order</span>
                <span className="text-xs font-mono text-indigo-600">{tx.reconciliationResult.order.orderId}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw payload */}
      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setJsonExpanded(!jsonExpanded)}
          className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 border-b border-slate-100 hover:bg-slate-100 transition-colors"
        >
          <span className="text-xs font-semibold text-slate-700">Raw Payload</span>
          {jsonExpanded ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
        </button>
        {jsonExpanded && (
          <pre className="p-4 text-[10px] text-slate-600 font-mono overflow-x-auto bg-white max-h-48">
            {JSON.stringify(rawPayload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Transactions Page ────────────────────────────────────────────────────────
export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [matchFilter, setMatchFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [slideOverId, setSlideOverId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced search
  const handleSearch = (val: string) => {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
    setPage(1);
  };

  const params = new URLSearchParams({
    page: String(page), limit: '25', sortBy, sortDir,
    ...(search ? { search } : {}),
    ...(sourceFilter.length ? { source: sourceFilter.join(',') } : {}),
    ...(statusFilter.length ? { status: statusFilter.join(',') } : {}),
    ...(matchFilter.length ? { matchStatus: matchFilter.join(',') } : {}),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', params.toString()],
    queryFn: async () => { const { data } = await api.get(`/transactions?${params}`); return data; },
    staleTime: 15000,
  });

  // CSV export — calls backend for full (not just current-page) export
  const handleExport = async () => {
    const toastId = toast.loading('Preparing export...');
    try {
      const body: Record<string, string> = {};
      if (search) body.search = search;
      if (sourceFilter.length) body.source = sourceFilter.join(',');
      if (statusFilter.length) body.status = statusFilter.join(',');
      if (matchFilter.length) body.matchStatus = matchFilter.join(',');

      const response = await api.post('/transactions/export', body, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exported successfully', { id: toastId });
    } catch {
      toast.error('Export failed', { id: toastId });
    }
  };

  // Toggle filter chips
  const toggleFilter = (arr: string[], setter: (v: string[]) => void, val: string) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
    setPage(1);
  };

  const toggleSelected = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };

  const toggleAll = () => {
    if (!data) return;
    if (selectedIds.size === data.data.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(data.data.map(t => t.id)));
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ChevronDown size={10} className="text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUp size={10} className="text-indigo-500" /> : <ChevronDown size={10} className="text-indigo-500" />;
  };

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by ID, payer, payee..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-slate-50"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter size={12} className="text-slate-400" />
            <span className="text-xs text-slate-500">Filters:</span>
          </div>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors btn-press ml-auto">
            <Download size={12} /> Export CSV
          </button>
        </div>

        {/* Source filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-slate-400 self-center mr-1">Source:</span>
          {SOURCE_OPTIONS.map(s => (
            <button key={s} onClick={() => toggleFilter(sourceFilter, setSourceFilter, s)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ${
                sourceFilter.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-slate-400 self-center mr-1">Status:</span>
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => toggleFilter(statusFilter, setStatusFilter, s)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ${
                statusFilter.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {s}
            </button>
          ))}
          <span className="text-[11px] text-slate-400 self-center ml-3 mr-1">Match:</span>
          {MATCH_STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => toggleFilter(matchFilter, setMatchFilter, s)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ${
                matchFilter.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border-b border-indigo-100">
            <span className="text-xs font-medium text-indigo-700">{selectedIds.size} selected</span>
            <button className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 btn-press">
              Mark as Ignored
            </button>
            <button className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 btn-press"
              onClick={() => setSelectedIds(new Set())}>
              Clear Selection
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="w-8 px-4 py-3">
                  <button onClick={toggleAll} className="text-slate-400 hover:text-indigo-600">
                    {data && selectedIds.size === data.data.length && data.data.length > 0
                      ? <CheckSquare size={13} className="text-indigo-600" />
                      : <Square size={13} />}
                  </button>
                </th>
                {[
                  { field: 'externalId', label: 'External ID' },
                  { field: 'source', label: 'Source' },
                  { field: 'amount', label: 'Amount' },
                  { field: 'status', label: 'Status' },
                  { field: 'timestamp', label: 'Timestamp' },
                  { field: 'reconciliationStatus', label: 'Recon Status' },
                  { field: 'confidence', label: 'Confidence' },
                ].map(col => (
                  <th key={col.field}
                    onClick={() => col.field !== 'confidence' && handleSort(col.field)}
                    className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${col.field !== 'confidence' ? 'cursor-pointer hover:text-slate-700 select-none' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.field !== 'confidence' && <SortIcon field={col.field} />}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9}><SkeletonTable rows={10} cols={8} /></td></tr>
              ) : !data?.data.length ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-600">No transactions found</p>
                  <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search query</p>
                </td></tr>
              ) : data.data.map((tx, idx) => (
                <tr key={tx.id}
                  className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer group
                    ${idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}
                    ${selectedIds.has(tx.id) ? 'bg-indigo-50/40' : ''}
                  `}
                  onClick={() => setSlideOverId(tx.id)}
                >
                  <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelected(tx.id); }}>
                    {selectedIds.has(tx.id)
                      ? <CheckSquare size={13} className="text-indigo-600" />
                      : <Square size={13} className="text-slate-300 group-hover:text-slate-400" />}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-slate-700">{tx.externalId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <SourceBadge source={tx.source} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-slate-800 tabular-nums">{formatINR(tx.amount)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge type="txStatus" value={tx.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-600">{formatDateTime(tx.timestamp)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge type="reconStatus" value={tx.reconciliationStatus} />
                  </td>
                  <td className="px-4 py-3 min-w-[100px]">
                    {tx.reconciliationResult ? (
                      <ConfidenceBar score={tx.reconciliationResult.confidenceScore} />
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSlideOverId(tx.id); }}
                      className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink size={10} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.pagination && (
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            limit={data.pagination.limit}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Slide-over */}
      <SlideOver
        open={!!slideOverId}
        onClose={() => setSlideOverId(null)}
        title="Transaction Detail"
        subtitle={slideOverId ? `ID: ${slideOverId.substring(0, 12)}...` : ''}
      >
        {slideOverId && <TransactionDetail txId={slideOverId} />}
      </SlideOver>
    </div>
  );
}
