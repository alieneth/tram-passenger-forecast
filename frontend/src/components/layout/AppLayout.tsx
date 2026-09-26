import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { LoadingState } from '../states/LoadingState';
import { ScreenErrorBoundary } from '../states/ScreenErrorBoundary';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="app">
      <Header />
      <Sidebar />
      <main className="content">
        <ScreenErrorBoundary key={pathname}>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </ScreenErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
