import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';

// Import Pages
import Dashboard from './pages/Dashboard';
import JamOperasional from './pages/JamOperasional';
import Kelas from './pages/Kelas';
import Instruktur from './pages/Instruktur';
import Paket from './pages/Paket';
import Transaksi from './pages/Transaksi';
import Member from './pages/Member';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Semua route admin dilindungi ProtectedRoute */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="jam-operasional" element={<JamOperasional />} />
            <Route path="kelas" element={<Kelas />} />
            <Route path="instruktur" element={<Instruktur />} />
            <Route path="paket" element={<Paket />} />
            <Route path="transaksi" element={<Transaksi />} />
            <Route path="member" element={<Member />} />
            
            {/* Catch-all route untuk 404 di dalam area admin */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
        
        {/* Catch-all route untuk URL asing di luar / (opsional, diarahkan ke login atau 404) */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}