import Sidebar from './Sidebar';
import Header  from './Header';
import { Outlet } from 'react-router-dom';

export default function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
