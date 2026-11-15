import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { session } from './lib/api';
import { LangContext } from './lib/app-context';
import type { Lang } from './i18n';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { OrdersPage } from './pages/Orders';
import { OrderDetailPage } from './pages/OrderDetail';
import { TrackingPage } from './pages/Tracking';
import { CataloguePage, ProductPage } from './pages/Catalogue';
import { InventoryPage } from './pages/Inventory';
import { KitsPage, TemplatesPage } from './pages/Kits';
import { DoctorsPage } from './pages/Doctors';
import { AgentsPage, AuditPage, HospitalsPage, NotificationsPage, ReportsPage, SettingsPage, StaffPage } from './pages/Admin';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } } });

function Guard({ children }: { children: ReactNode }) {
  const [s, setS] = useState(session.get());
  useEffect(() => {
    const f = () => setS(session.get());
    window.addEventListener('od-session', f);
    return () => window.removeEventListener('od-session', f);
  }, []);
  return s ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('od_lang') as Lang) || 'en'; } catch { return 'en'; }
  });
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('od_lang', l); } catch { /* ignore */ }
  };
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <QueryClientProvider client={qc}>
        <BrowserRouter basename="/admin">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Guard><Layout /></Guard>}>
              <Route index element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="tracking" element={<TrackingPage />} />
              <Route path="catalogue" element={<CataloguePage />} />
              <Route path="catalogue/:slug" element={<ProductPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="kits" element={<KitsPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="doctors" element={<DoctorsPage />} />
              <Route path="hospitals" element={<HospitalsPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="staff" element={<StaffPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </LangContext.Provider>
  );
}
