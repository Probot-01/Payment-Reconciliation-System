import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, AlertCircle, CheckCircle, Clock, DollarSign, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { useUIStore } from '../store';
import { formatINR, formatINRCompact, formatRelativeTime, MATCH_TYPE_CONFIG, SOURCE_COLORS } from '../lib/utils';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { SourceBadge, sourceShortLabel } from '../components/ui/SourceBadge';
import type { DashboardData } from '../types';

const DONUT_COLORS = ['#10B981', '#EF4444', '#94A3B8'];

const DATE_RANGE_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  trend?: string;
}

function KpiCard({ title, value, subtitle, icon: Icon, iconColor, trend }: KpiCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-200 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg`} style={{ backgroundColor: `${iconColor}15` }}>
          <Icon size={14} style={{ color: iconColor }} />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
      {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
      {trend && (
        <div className="flex items-center gap-1 mt-2">
          <TrendingUp size={10} className="text-emerald-500" />
          <span className="text-[11px] text-emerald-600 font-medium">{trend}</span>
        </div>
      )}
    </div>
  );
}

// ─── Recent Flags Feed ────────────────────────────────────────────────────────
function RecentFlagsFeed({ flags }: { flags: DashboardData['recentFlags'] }) {
  if (flags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle size={32} className="text-emerald-400 mb-3" />
        <p className="text-sm font-medium text-slate-700">All clear!</p>
        <p className="text-xs text-slate-400 mt-1">No flagged items in this period</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-50">
      {flags.map((flag) => {
        const config = MATCH_TYPE_CONFIG[flag.matchType] || { label: flag.matchType, badgeClass: 'badge-neutral', severity: 'neutral' as const };
        return (
          <div key={flag.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition-colors group">
            <div className={`flex-shrink-0 w-2 h-2 rounded-full ${
              config.severity === 'danger' ? 'bg-red-500' :
              config.severity === 'warning' ? 'bg-amber-500' :
              'bg-slate-300'
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <StatusBadge type="matchType" value={flag.matchType} />
                {flag.transaction && (
                  <span className="text-[11px] text-slate-500 font-mono truncate">
                    {flag.transaction.externalId}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">{flag.notes}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-semibold text-slate-800">
                {flag.amountDelta !== 0 ? formatINR(Math.abs(flag.amountDelta)) : '—'}
              </p>
              <p className="text-[11px] text-slate-400">{formatRelativeTime(flag.createdAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export function DashboardPage() {
  const { dateRange, setDateRange } = useUIStore();

  const { data, isLoading, isFetching, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard', dateRange],
    queryFn: async () => {
      const { data } = await api.get(`/dashboard?range=${dateRange}`);
      return data;
    },
    staleTime: 30000,
  });

  const handleRunRecon = async () => {
    const toastId = toast.loading('Running reconciliation engine...');
    try {
      const { data: result } = await api.post('/reconciliation/run');
      toast.success(`Reconciliation complete — ${result.saved} new results`, { id: toastId });
      refetch();
    } catch {
      toast.error('Reconciliation failed. Please try again.', { id: toastId });
    }
  };

  // Build donut data
  const donutData = data ? [
    { name: 'Matched', value: data.statusBreakdown.matched },
    { name: 'Flagged', value: data.statusBreakdown.flagged },
    { name: 'Unmatched', value: data.statusBreakdown.unmatched },
  ] : [];

  // Bar chart data (format source names)
  const barData = data?.sourceBreakdown.map(s => ({
    name: sourceShortLabel(s.source),
    volume: Math.round(s.amount / 100),
    count: s.count,
    color: SOURCE_COLORS[s.source] || '#6366F1',
  })) || [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors btn-press ${
                dateRange === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleRunRecon}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors btn-press disabled:opacity-70"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
          Run Reconciliation
        </button>
      </div>

      {/* KPI Strip */}
      {isLoading ? (
        <div className="grid grid-cols-5 gap-4">
          {Array(5).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            title="Total Volume"
            value={formatINRCompact(data.kpis.totalVolume)}
            subtitle={`${data.kpis.totalTransactions.toLocaleString('en-IN')} transactions`}
            icon={DollarSign}
            iconColor="#6366F1"
          />
          <KpiCard
            title="Match Rate"
            value={`${data.kpis.matchRate}%`}
            subtitle="Auto-matched successfully"
            icon={CheckCircle}
            iconColor="#10B981"
            trend={data.kpis.matchRate > 80 ? `${data.kpis.matchRate}% match rate` : undefined}
          />
          <KpiCard
            title="Flagged Items"
            value={data.kpis.flaggedCount.toLocaleString('en-IN')}
            subtitle="Require manual review"
            icon={AlertCircle}
            iconColor="#EF4444"
          />
          <KpiCard
            title="Pending Orders"
            value={data.kpis.pendingOrders.toLocaleString('en-IN')}
            subtitle="Awaiting payment"
            icon={Clock}
            iconColor="#F59E0B"
          />
          <KpiCard
            title="Avg Resolution"
            value={`${data.kpis.avgResolutionMins}m`}
            subtitle="Time to resolve flags"
            icon={TrendingUp}
            iconColor="#3B82F6"
          />
        </div>
      ) : null}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Bar chart: Volume by source */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Volume by Source</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Payment volume breakdown by channel</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-48 skeleton rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(val: number) => [`₹${val.toLocaleString('en-IN')}`, 'Volume']}
                />
                <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Donut chart: Reconciliation status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-800">Reconciliation Status</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Distribution of match outcomes</p>
          </div>
          {isLoading ? (
            <div className="h-48 skeleton rounded-lg" />
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {donutData.map((_, index) => (
                      <Cell key={index} fill={DONUT_COLORS[index]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {donutData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[i] }} />
                      <span className="text-xs text-slate-600">{item.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800">{item.value.toLocaleString('en-IN')}</span>
                  </div>
                ))}
                {data && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500 font-medium">Total</span>
                      <span className="text-xs font-bold text-slate-900">
                        {(data.statusBreakdown.matched + data.statusBreakdown.flagged + data.statusBreakdown.unmatched).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Flags */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Recent Flags</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Items requiring your attention</p>
          </div>
          {data && data.kpis.flaggedCount > 0 && (
            <span className="px-3 py-1 text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100 rounded-full">
              {data.kpis.flaggedCount} flagged
            </span>
          )}
        </div>
        {isLoading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : (
          <RecentFlagsFeed flags={data?.recentFlags || []} />
        )}
      </div>
    </div>
  );
}
