import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getUser, clearAuth } from '../../lib/auth';
import api from '../../lib/api';

// Ikon dihapus, murni hanya teks dan link
const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Jam Operasional', href: '/jam-operasional' },
  { name: 'Kelas & Jadwal', href: '/kelas' },
  { name: 'Instruktur', href: '/instruktur' },
  { name: 'Paket Keanggotaan', href: '/paket' },
  { name: 'Transaksi', href: '/transaksi' },
  { name: 'Member', href: '/member' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser(); 

  const handleLogout = async () => {
    try {
      await api.post('/logout'); 
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950">
      {/* Sidebar */}
      <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold text-white">Revira Gym</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-amber-400 text-zinc-950 font-semibold' 
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
          <h2 className="text-xl font-semibold text-gray-800">Admin Panel</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 font-medium">{user?.name || 'Admin'}</span>
            <button 
              onClick={handleLogout}
              className="text-sm px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 font-medium transition-colors"
            >
              Keluar
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}