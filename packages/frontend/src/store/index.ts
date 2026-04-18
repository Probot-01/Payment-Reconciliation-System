import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

// ─── Auth Store ───────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        localStorage.setItem('reconai_token', token);
        set({ token, user });
      },
      clearAuth: () => {
        localStorage.removeItem('reconai_token');
        set({ token: null, user: null });
      },
      isAuthenticated: () => !!get().token,
    }),
    { name: 'reconai_auth', partialize: (state) => ({ token: state.token, user: state.user }) }
  )
);

// ─── UI Store ─────────────────────────────────────────────────────────────────

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;

  slideOverOpen: boolean;
  slideOverId: string | null;
  slideOverType: 'transaction' | 'order' | 'reconciliation' | null;
  openSlideOver: (id: string, type: 'transaction' | 'order' | 'reconciliation') => void;
  closeSlideOver: () => void;

  dateRange: string;
  setDateRange: (range: string) => void;

  flaggedCount: number;
  setFlaggedCount: (count: number) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  slideOverOpen: false,
  slideOverId: null,
  slideOverType: null,
  openSlideOver: (id, type) => set({ slideOverOpen: true, slideOverId: id, slideOverType: type }),
  closeSlideOver: () => set({ slideOverOpen: false, slideOverId: null, slideOverType: null }),

  dateRange: '7d',
  setDateRange: (range) => set({ dateRange: range }),

  flaggedCount: 0,
  setFlaggedCount: (count) => set({ flaggedCount: count }),
}));
