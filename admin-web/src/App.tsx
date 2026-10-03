import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './components/layout/AdminLayout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<div>Dashboard Placeholder</div>} />
          <Route path="jam-operasional" element={<div>Jam Operasional Placeholder</div>} />
          <Route path="kelas" element={<div>Kelas & Jadwal Placeholder</div>} />
          <Route path="instruktur" element={<div>Instruktur Placeholder</div>} />
          <Route path="paket" element={<div>Paket Keanggotaan Placeholder</div>} />
          <Route path="transaksi" element={<div>Transaksi Placeholder</div>} />
          <Route path="member" element={<div>Member Placeholder</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}