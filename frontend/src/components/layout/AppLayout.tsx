import { Outlet } from 'react-router';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="app">
      <Header />
      <Sidebar />
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
