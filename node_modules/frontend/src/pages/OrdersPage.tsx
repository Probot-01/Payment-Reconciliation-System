import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, ChevronUp, ChevronDown, AlertTriangle, ExternalLink, Download } from 'lucide-react';
import api from '../lib/api';
import { formatINR, formatDateTime } from '../lib/utils';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfidenceBar } from '../components/ui/ConfidenceBar';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Pagination } from '../components/ui/Pagination';
import { SlideOver } from '../components/ui/SlideOver';
import type { SalesOrder, PaginatedResponse } from '../types';

const ORDER_STATUS_OPTIONS = ['PAID', 'UNPAID', 'PARTIAL', 'OVERPAID'];

function OrderDetail({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useQuery<SalesOrder>({
    queryKey: ['order', orderId],
    queryFn: async () => { const { data } = await api.get(`/orders/${orderId}`); return data; },
  });

  if (isLoading) return <div className="p-6 space-y-4">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>;
  if (!order) return <div className="p-6 text-center text-xs text-slate-500">Order not found</div>;

  const isOverdue = order.status !== 'PAID' && new Date(order.paymentExpected) < new Date();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <StatusBadge type="orderStatus" value={order.status} size="md" />
        {isOverdue && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
            <AlertTriangle size={11} /> Overdue
          </span>
        )}
      </div>

      <div className="bg-slate-50 rounded-xl p-5 text-center border border-slate-100">
        <p className="text-[11px] text-slate-400 mb-1">Order Amount</p>
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatINR(order.amount)}</p>
        <p className="text-xs text-slate-500 mt-1">{order.currency}</p>
      </div>

      <div className="space-y-3">
        {[
          { label: 'Order ID', value: order.orderId, mono: true },
          { label: 'Customer Name', value: order.customerName },
          { label: 'Customer ID', value: order.customerId, mono: true },
          { label: 'Source', value: order.source },
          { label: 'Expected Payment', value: formatDateTime(order.paymentExpected) },
          { label: 'Payment Received', value: order.paymentReceivedAt ? formatDateTime(order.paymentReceivedAt) : '—' },
          { label: 'Created At', value: formatDateTime(order.createdAt) },
        ].map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-4">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">{row.label}</span>
            <span className={`text-xs text-slate-800 text-right ${row.mono ? 'font-mono' : 'font-medium'}`}>{row.value}</span>
          </div>
        ))}
      </div>

      {order.reconciliationResult && (
        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">Reconciliation Result</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-400">Match Type</span>
              <StatusBadge type="matchType" value={order.reconciliationResult.matchType} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Confidence</span>
              <ConfidenceBar score={order.reconciliationResult.confidenceScore} height={6} />
            </div>
            {order.reconciliationResult.transaction && (
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Linked Transaction</span>
                <span className="text-xs font-mono text-indigo-600">{order.reconciliationResult.transaction.externalId}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [slideOverId, setSlideOverId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearch = (val: string) => {
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(1); }, 300);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
    setPage(1);
  };

  const params = new URLSearchParams({
    page: String(page), limit: '25', sortBy, sortDir,
    ...(search ? { search } : {}),
    ...(statusFilter.length ? { status: statusFilter.join(',') } : {}),
    ...(overdueOnly ? { overdue: 'true' } : {}),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<SalesOrder>>({
    queryKey: ['orders', params.toString()],
    queryFn: async () => { const { data } = await api.get(`/orders?${params}`); return data; },
    staleTime: 15000,
  });

  const handleExport = () => {
    if (!data?.data) return;
    const csv = [
      ['Order ID', 'Customer', 'Amount (₹)', 'Status', 'Expected Payment', 'Received At'].join(','),
      ...data.data.map(o => [
        o.orderId, o.customerName, (o.amount / 100).toFixed(2),
        o.status, formatDateTime(o.paymentExpected),
        o.paymentReceivedAt ? formatDateTime(o.paymentReceivedAt) : '',
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'orders.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Orders exported successfully');
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
            <input type="search" value={searchInput} onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by order ID, customer..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50" />
          </div>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors btn-press ml-auto">
            <Download size={12} /> Export CSV
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-slate-400 mr-1">Status:</span>
          {ORDER_STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => {
              setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
              setPage(1);
            }}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ${
                statusFilter.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
            >{s}</button>
          ))}
          <button onClick={() => { setOverdueOnly(!overdueOnly); setPage(1); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors btn-press ml-2 ${
              overdueOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
            }`}
          >
            <AlertTriangle size={10} /> Overdue only
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {[
                  { field: 'orderId', label: 'Order ID' },
                  { field: 'customerName', label: 'Customer' },
                  { field: 'amount', label: 'Amount' },
                  { field: 'status', label: 'Payment Status' },
                  { field: 'paymentExpected', label: 'Expected Payment' },
                  { field: 'recon', label: 'Match Status' },
                ].map(col => (
                  <th key={col.field}
                    onClick={() => col.field !== 'recon' && handleSort(col.field)}
                    className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${col.field !== 'recon' ? 'cursor-pointer hover:text-slate-700 select-none' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.field !== 'recon' && <SortIcon field={col.field} />}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7}><SkeletonTable rows={10} cols={6} /></td></tr>
              ) : !data?.data.length ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-600">No orders found</p>
                  <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
                </td></tr>
              ) : data.data.map((order, idx) => {
                const isOverdue = order.status !== 'PAID' && new Date(order.paymentExpected) < new Date();
                return (
                  <tr key={order.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer group
                      ${idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'}
                      ${isOverdue ? 'bg-amber-50/30' : ''}
                    `}
                    onClick={() => setSlideOverId(order.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isOverdue && <AlertTriangle size={11} className="text-amber-500 flex-shrink-0" />}
                        <span className="text-xs font-mono text-slate-700">{order.orderId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-medium text-slate-800">{order.customerName}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{order.customerId}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-slate-800 tabular-nums">{formatINR(order.amount)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge type="orderStatus" value={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${isOverdue ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                        {formatDateTime(order.paymentExpected)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.reconciliationResult ? (
                        <StatusBadge type="matchType" value={order.reconciliationResult.matchType} />
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={(e) => { e.stopPropagation(); setSlideOverId(order.id); }}
                        className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink size={10} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data?.pagination && (
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages}
            total={data.pagination.total} limit={data.pagination.limit} onPageChange={setPage} />
        )}
      </div>

      <SlideOver open={!!slideOverId} onClose={() => setSlideOverId(null)}
        title="Order Detail" subtitle={slideOverId ? `ID: ${slideOverId.substring(0, 12)}...` : ''}>
        {slideOverId && <OrderDetail orderId={slideOverId} />}
      </SlideOver>
    </div>
  );
}
