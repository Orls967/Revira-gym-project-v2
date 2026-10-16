import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
// Buka komentar import api di bawah ini saat mengaktifkan integrasi backend SCRUM-54
// import api from '../lib/api';

interface Instructor {
  id: number;
  name: string;
  email: string;
  phone: string;
  specialty: string;
  is_active: boolean;
}

export default function Instruktur() {
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    is_active: true
  });

  const fetchInstructors = async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      // --- MOCK API DATA ---
      await new Promise(resolve => setTimeout(resolve, 800));
      setInstructors([
        { id: 1, name: 'Budi Santoso', email: 'budi@revira.test', phone: '081234567890', specialty: 'Yoga, Pilates', is_active: true },
        { id: 2, name: 'Siti Aminah', email: 'siti@revira.test', phone: '081298765432', specialty: 'Zumba, Aerobik', is_active: true },
        { id: 3, name: 'Andi Darmawan', email: 'andi@revira.test', phone: '081345678901', specialty: 'Weightlifting, Crossfit', is_active: false },
        { id: 4, name: 'Rina Melati', email: 'rina@revira.test', phone: '081456789012', specialty: 'HIIT Cardio', is_active: true },
        { id: 5, name: 'Tono Wijaya', email: 'tono@revira.test', phone: '081567890123', specialty: 'Muay Thai', is_active: true },
        { id: 6, name: 'Maya Sari', email: 'maya@revira.test', phone: '081678901234', specialty: 'Yoga', is_active: true },
      ]);
      
      // Buka komentar di bawah jika backend SCRUM-54 sudah siap
      // const response = await api.get('/instructors');
      // setInstructors(response.data.data);
    } catch {
      setFetchError('Gagal memuat data instruktur.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInstructors();
  }, []);

  // Filter & Pagination Logic
  const filteredInstructors = instructors.filter(inst => 
    inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inst.specialty.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredInstructors.length / itemsPerPage);

  // Penyesuaian otomatis currentPage jika item terakhir pada halaman terakhir dihapus
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const safeCurrentPage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
  const currentData = filteredInstructors.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  const openModal = (instructor?: Instructor) => {
    if (instructor) {
      setEditingId(instructor.id);
      setFormData({
        name: instructor.name,
        email: instructor.email,
        phone: instructor.phone,
        specialty: instructor.specialty,
        is_active: instructor.is_active
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', email: '', phone: '', specialty: '', is_active: true });
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    
    try {
      // --- MOCK API CALL ---
      await new Promise(resolve => setTimeout(resolve, 800));
      
      if (editingId) {
        setInstructors(prev => prev.map(i => i.id === editingId ? { ...i, ...formData } as Instructor : i));
      } else {
        setInstructors(prev => [{ id: Date.now(), ...formData } as Instructor, ...prev]);
      }

      // Buka komentar di bawah jika backend siap
      // if (editingId) {
      //   await api.put(`/instructors/${editingId}`, formData);
      // } else {
      //   await api.post('/instructors', formData);
      // }
      // fetchInstructors();

      setIsModalOpen(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setFormError(err.response?.data?.message || 'Terjadi kesalahan saat menyimpan data.');
      } else {
        setFormError('Terjadi kesalahan saat menyimpan data.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus instruktur ini?')) return;
    
    try {
      // --- MOCK 409 CONFLICT SIMULATION ---
      // Jika mencoba menghapus instruktur ID 1 (Budi Santoso), simulasikan error jadwal bentrok
      if (id === 1) {
        throw { response: { status: 409, data: { message: 'Instruktur masih memiliki jadwal sesi kelas yang aktif.' } } };
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setInstructors(prev => prev.filter(i => i.id !== id));

      // Buka komentar di bawah jika backend siap
      // await api.delete(`/instructors/${id}`);
      // fetchInstructors();
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (apiErr.response?.status === 409) {
        alert(`Gagal Menghapus (Error 409):\n${apiErr.response.data?.message || 'Konflik jadwal.'}`);
      } else {
        alert('Gagal menghapus instruktur.');
      }
    }
  };

  return (
    <div>
      <PageHeader title="Manajemen Instruktur">
        <button 
          onClick={() => openModal()}
          className="bg-amber-400 hover:bg-amber-500 text-zinc-950 px-4 py-2 rounded-md font-bold text-sm transition-colors"
        >
          + Tambah Instruktur
        </button>
      </PageHeader>

      {/* Pencarian */}
      <div className="mb-6 flex">
        <input 
          type="text" 
          placeholder="Cari nama atau spesialisasi instruktur..." 
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="w-full max-w-md px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-white focus:ring-amber-400 focus:border-amber-400 placeholder-zinc-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-zinc-800 animate-pulse rounded-lg"></div>)}
        </div>
      ) : fetchError ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
          <p className="mb-4">{fetchError}</p>
          <button onClick={fetchInstructors} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm">Coba Lagi</button>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/50 text-zinc-400 uppercase border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Nama</th>
                <th className="px-6 py-4 font-medium">Kontak</th>
                <th className="px-6 py-4 font-medium">Spesialisasi</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {currentData.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Tidak ada instruktur ditemukan.</td></tr>
              ) : (
                currentData.map((inst) => (
                  <tr key={inst.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{inst.name}</td>
                    <td className="px-6 py-4">
                      <div className="text-white">{inst.phone}</div>
                      <div className="text-xs text-zinc-500">{inst.email}</div>
                    </td>
                    <td className="px-6 py-4">{inst.specialty}</td>
                    <td className="px-6 py-4">
                      {inst.is_active 
                        ? <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium">Aktif</span>
                        : <span className="bg-zinc-500/10 text-zinc-400 px-2.5 py-1 rounded-full text-xs font-medium">Nonaktif</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button onClick={() => openModal(inst)} className="text-amber-400 hover:text-amber-300 font-medium">Edit</button>
                      <button onClick={() => handleDelete(inst.id)} className="text-red-400 hover:text-red-300 font-medium">Hapus</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {/* Paginasi */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 bg-zinc-950/30">
              <span className="text-sm text-zinc-400">Halaman {safeCurrentPage} dari {totalPages}</span>
              <div className="space-x-2">
                <button 
                  disabled={safeCurrentPage === 1} 
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <button 
                  disabled={safeCurrentPage === totalPages} 
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 disabled:opacity-50"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Form Instruktur */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title={editingId ? "Ubah Data Instruktur" : "Tambah Instruktur Baru"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">{formError}</div>}
          
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Nama Lengkap</label>
            <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
              <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">No. HP</label>
              <input type="text" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Spesialisasi</label>
            <input type="text" required value={formData.specialty} placeholder="Contoh: Yoga, Zumba" onChange={e => setFormData({...formData, specialty: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
          </div>

          <div className="flex items-center pt-2">
            <input type="checkbox" id="isActive" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 text-amber-500 bg-zinc-950 border-zinc-700 rounded focus:ring-amber-500" />
            <label htmlFor="isActive" className="ml-2 text-sm text-zinc-300">Instruktur Aktif</label>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">Batal</button>
            <button type="submit" disabled={isSubmitting} className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${isSubmitting ? 'bg-amber-600 text-zinc-900 cursor-not-allowed' : 'bg-amber-400 text-zinc-950 hover:bg-amber-500'}`}>
              {isSubmitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}