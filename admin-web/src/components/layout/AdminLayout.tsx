import { NavLink, Outlet, useNavigate } from 'react-router-dom';

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

  const handleLogout = () => {
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white fixed h-full flex flex-col hidden lg:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
          <h1 className="text-xl font-bold">Revira Gym Admin</h1>
        </div>
        <nav className="flex-1 py-4 flex flex-col gap-1 px-3">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:pl-64">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-gray-800">Admin Panel</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Admin Name</span>
            <button
              onClick={handleLogout}
              className="text-sm px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 font-medium transition-colors"
            >
              Keluar
            </button>
          </div>
        </header>
        <main className="p-6 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}