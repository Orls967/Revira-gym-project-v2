import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
import api from '../lib/api';

interface OperationalHour {
  id?: number;
  day_of_week: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export default function JamOperasional() {
  const [hours, setHours] = useState<OperationalHour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  
  // State Modal Form Tambah/Ubah
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State Modal Konfirmasi Hapus
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingDay, setDeletingDay] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [formData, setFormData] = useState({
    day: 'Senin',
    open_time: '08:00',
    close_time: '22:00',
    is_holiday: false
  });

  const daysOption = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  const fetchHours = async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      const response = await api.get('/operational-hours');
      setHours(response.data.data);
    } catch {
      setFetchError('Gagal memuat data jam operasional.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHours();
  }, []);

  const openModal = (hour?: OperationalHour) => {
    if (hour) {
      setEditingDay(hour.day_of_week);
      setFormData({
        day: hour.day_of_week,
        open_time: hour.open_time ? hour.open_time.substring(0, 5) : '08:00',
        close_time: hour.close_time ? hour.close_time.substring(0, 5) : '22:00',
        is_holiday: hour.is_closed
      });
    } else {
      setEditingDay(null);
      setFormData({ day: 'Senin', open_time: '08:00', close_time: '22:00', is_holiday: false });
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    // Validasi jam buka & tutup
    if (!formData.is_holiday && formData.close_time <= formData.open_time) {
      setFormError('Jam tutup harus lebih dari jam buka.');
      return;
    }

    // Validasi hari duplikat saat tambah baru
    if (!editingDay && hours.some(h => h.day_of_week === formData.day)) {
      setFormError(`Jadwal untuk hari ${formData.day} sudah ada.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: OperationalHour = {
        day_of_week: formData.day,
        open_time: formData.is_holiday ? null : formData.open_time,
        close_time: formData.is_holiday ? null : formData.close_time,
        is_closed: formData.is_holiday
      };

      // --- MOCK SIMULASI (Delay 1 Detik & Update Tabel Lokal) ---
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (editingDay) {
        setHours(prev => prev.map(h => h.day_of_week === editingDay ? { ...h, ...payload } : h));
      } else {
        setHours(prev => [...prev, { id: Date.now(), ...payload }]);
      }

      // =====================================================================
      // HAPUS MOCK DI ATAS & BUKA KOMENTAR DI BAWAH JIKA BACKEND SUDAH SIAP:
      // =====================================================================
      // if (editingDay) {
      //   await api.put(`/operational-hours/${editingDay}`, payload);
      // } else {
      //   await api.post('/operational-hours', payload);
      // }
      // fetchHours();
      // =====================================================================
      
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

  // Buka Modal Konfirmasi Hapus
  const confirmDelete = (day_of_week: string) => {
    setDeletingDay(day_of_week);
    setIsDeleteModalOpen(true);
  };

  // Eksekusi Hapus dengan Simulasi Delay 1 Detik
  const handleDelete = async () => {
    if (!deletingDay) return;
    setIsDeleting(true);

    try {
      // --- MOCK SIMULASI DELETE (Delay 1 Detik & Update Tabel Lokal) ---
      await new Promise(resolve => setTimeout(resolve, 1000));
      setHours(prev => prev.filter(h => h.day_of_week !== deletingDay));

      // =====================================================================
      // HAPUS MOCK DI ATAS & BUKA KOMENTAR DI BAWAH JIKA BACKEND SUDAH SIAP:
      // =====================================================================
      // await api.delete(`/operational-hours/${deletingDay}`);
      // fetchHours();
      // =====================================================================

      setIsDeleteModalOpen(false);
      setDeletingDay(null);
    } catch {
      alert('Gagal menghapus jadwal.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Jam Operasional">
        <button 
          onClick={() => openModal()}
          className="bg-amber-400 hover:bg-amber-500 text-zinc-950 px-4 py-2 rounded-md font-bold text-sm transition-colors"
        >
          + Tambah Jadwal
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-zinc-800 animate-pulse rounded-lg"></div>
          ))}
        </div>
      ) : fetchError ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
          <p className="mb-4">{fetchError}</p>
          <button onClick={fetchHours} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm">
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/50 text-zinc-400 uppercase border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Hari</th>
                <th className="px-6 py-4 font-medium">Jam Buka</th>
                <th className="px-6 py-4 font-medium">Jam Tutup</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {hours.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">Belum ada jadwal yang diatur.</td>
                </tr>
              ) : (
                hours.map((h, index) => (
                  <tr key={h.id || h.day_of_week || index} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{h.day_of_week}</td>
                    <td className="px-6 py-4">{h.is_closed ? '-' : h.open_time?.substring(0, 5)}</td>
                    <td className="px-6 py-4">{h.is_closed ? '-' : h.close_time?.substring(0, 5)}</td>
                    <td className="px-6 py-4">
                      {h.is_closed 
                        ? <span className="bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full text-xs font-medium">Libur</span>
                        : <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium">Buka</span>
                      }
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      <button onClick={() => openModal(h)} className="text-amber-400 hover:text-amber-300 font-medium">Edit</button>
                      <button onClick={() => confirmDelete(h.day_of_week)} className="text-red-400 hover:text-red-300 font-medium">Hapus</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form Tambah/Ubah */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => !isSubmitting && setIsModalOpen(false)} 
        title={editingDay ? "Ubah Jadwal" : "Tambah Jadwal Baru"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
              {formError}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Hari</label>
            <select 
              value={formData.day}
              disabled={!!editingDay}
              onChange={(e) => setFormData({...formData, day: e.target.value})}
              className={`w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400 ${
                editingDay ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {daysOption.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {editingDay && (
              <p className="text-xs text-zinc-500 mt-1">Hari tidak dapat diubah pada mode edit.</p>
            )}
          </div>

          <div className="flex items-center mt-4 mb-4">
            <input 
              type="checkbox" 
              id="isHoliday"
              checked={formData.is_holiday}
              onChange={(e) => setFormData({...formData, is_holiday: e.target.checked})}
              className="w-4 h-4 text-amber-500 bg-zinc-950 border-zinc-700 rounded focus:ring-amber-500"
            />
            <label htmlFor="isHoliday" className="ml-2 text-sm text-zinc-300">Tandai sebagai Hari Libur</label>
          </div>

          {!formData.is_holiday && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Jam Buka</label>
                <input 
                  type="time" 
                  required={!formData.is_holiday}
                  value={formData.open_time}
                  onChange={(e) => setFormData({...formData, open_time: e.target.value})}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Jam Tutup</label>
                <input 
                  type="time" 
                  required={!formData.is_holiday}
                  value={formData.close_time}
                  onChange={(e) => setFormData({...formData, close_time: e.target.value})}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400 [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end space-x-3">
            <button 
              type="button" 
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${
                isSubmitting ? 'bg-amber-600 text-zinc-900 cursor-not-allowed' : 'bg-amber-400 text-zinc-950 hover:bg-amber-500'
              }`}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title="Konfirmasi Hapus Jadwal"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Apakah Anda yakin ingin menghapus jadwal operasional untuk hari <span className="font-semibold text-white">{deletingDay}</span>?
          </p>
          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${
                isDeleting ? 'bg-red-700 text-zinc-300 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}