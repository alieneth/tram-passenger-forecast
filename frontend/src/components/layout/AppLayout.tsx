import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { LoadingState } from '../states/LoadingState';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="app">
      <Header />
      <Sidebar />
      <main className="content">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
