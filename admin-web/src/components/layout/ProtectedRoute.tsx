import { Navigate, Outlet } from 'react-router-dom';
import { getAuthToken, getUser, clearAuth } from '../../lib/auth';

export default function ProtectedRoute() {
  const token = getAuthToken();
  const user = getUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
    clearAuth();
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Akses Ditolak</h2>
          <p className="text-gray-700">Akun ini bukan akun admin.</p>
          <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
            Kembali ke Login
          </a>
        </div>
      </div>
    );
  }

  return <Outlet />;
}