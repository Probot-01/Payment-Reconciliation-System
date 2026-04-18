import React from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useUIStore } from '../../store';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Overview of reconciliation health' },
  '/transactions': { title: 'Transactions', subtitle: 'All payment transactions across sources' },
  '/orders': { title: 'Sales Orders', subtitle: 'Internal order records and payment status' },
  '/reconciliation': { title: 'Reconciliation', subtitle: 'Flagged items requiring review' },
  '/ingest': { title: 'Data Ingestion', subtitle: 'Import payment feeds and sales records' },
  '/settings': { title: 'Settings', subtitle: 'Configure matching rules and notifications' },
};

export function TopBar() {
  const location = useLocation();
  const { flaggedCount } = useUIStore();
  const pageInfo = PAGE_TITLES[location.pathname] || { title: 'ReconAI', subtitle: '' };

  return (
    <header className="flex items-center h-14 px-6 bg-white border-b border-slate-200 flex-shrink-0 gap-6">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-slate-900">{pageInfo.title}</h1>
        <p className="text-[11px] text-slate-400">{pageInfo.subtitle}</p>
      </div>

      {/* Search */}
      <div className="relative w-64 hidden md:block">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search transactions, orders..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
        />
      </div>

      {/* Notification bell */}
      <div className="relative">
        <button className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors btn-press">
          <Bell size={14} />
        </button>
        {flaggedCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold bg-red-500 text-white rounded-full">
            {flaggedCount > 99 ? '99+' : flaggedCount}
          </span>
        )}
      </div>
    </header>
  );
}
