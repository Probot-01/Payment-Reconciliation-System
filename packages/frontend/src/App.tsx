import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { OrdersPage } from './pages/OrdersPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { IngestPage } from './pages/IngestPage';
import { SettingsPage } from './pages/SettingsPage';

// Sync flagged count to Zustand store after data loads
import { useQuery } from '@tanstack/react-query';
import { useUIStore, useAuthStore } from './store';
import api from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Component to sync flagged count badge
function FlaggedCountSync() {
  const { token } = useAuthStore();
  const { setFlaggedCount } = useUIStore();

  useQuery({
    queryKey: ['flagged-count'],
    queryFn: async () => {
      const { data } = await api.get('/reconciliation?status=FLAGGED&limit=1');
      setFlaggedCount(data.flaggedCount || 0);
      return data;
    },
    enabled: !!token,
    refetchInterval: 60000, // Refresh every minute
  });

  return null;
}

// 404 / Not found
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-10">
      <p className="text-4xl font-bold text-slate-200 mb-4">404</p>
      <p className="text-sm font-semibold text-slate-700">Page not found</p>
      <a href="/" className="mt-4 text-xs text-indigo-600 hover:underline">Return to Dashboard</a>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FlaggedCountSync />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/reconciliation" element={<ReconciliationPage />} />
            <Route path="/ingest" element={<IngestPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
