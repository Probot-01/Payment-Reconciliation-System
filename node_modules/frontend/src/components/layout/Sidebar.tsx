import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, ShoppingCart,
  GitMerge, Upload, Settings, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../store';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { path: '/orders', label: 'Orders', icon: ShoppingCart },
  { path: '/reconciliation', label: 'Reconciliation', icon: GitMerge, hasBadge: true },
  { path: '/ingest', label: 'Ingest', icon: Upload },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { user, clearAuth } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar, flaggedCount } = useUIStore();
  const location = useLocation();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className={`flex flex-col h-full bg-white border-r border-slate-200 transition-all duration-200 flex-shrink-0 ${
        sidebarCollapsed ? 'w-[56px]' : 'w-[220px]'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-slate-100">
        <div className={`flex items-center gap-2.5 min-w-0 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
          {/* Pulse dot logo */}
          <div className="relative flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">R</span>
            </div>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-white animate-pulse" />
          </div>
          {!sidebarCollapsed && (
            <div>
              <span className="text-sm font-semibold text-slate-900">ReconAI</span>
              <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-semibold bg-indigo-50 text-indigo-600 rounded">BETA</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ path, label, icon: Icon, exact, hasBadge }) => {
          const active = isActive(path, exact);
          return (
            <NavLink
              key={path}
              to={path}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors group
                ${active
                  ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600 pl-[9px]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-transparent'
                }
                ${sidebarCollapsed ? 'justify-center px-2 pl-2' : ''}
              `}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={15} className={active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'} />
              {!sidebarCollapsed && (
                <span className="flex-1">{label}</span>
              )}
              {!sidebarCollapsed && hasBadge && flaggedCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-4 px-1 text-[10px] font-semibold bg-red-500 text-white rounded-full">
                  {flaggedCount > 99 ? '99+' : flaggedCount}
                </span>
              )}
              {sidebarCollapsed && hasBadge && flaggedCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-100 p-2">
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold flex-shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-800 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{user.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => clearAuth()}
          className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors btn-press
            ${sidebarCollapsed ? 'justify-center' : ''}
          `}
          title="Logout"
        >
          <LogOut size={13} />
          {!sidebarCollapsed && 'Logout'}
        </button>
        <button
          onClick={toggleSidebar}
          className={`flex items-center gap-2.5 w-full px-2.5 py-2 mt-1 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors btn-press
            ${sidebarCollapsed ? 'justify-center' : ''}
          `}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          {!sidebarCollapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
