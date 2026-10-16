import React, { useState, useEffect } from 'react';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
// Buka komentar import api di bawah ini saat mengaktifkan integrasi backend SCRUM-52 & SCRUM-55
// import api from '../lib/api';

// --- TIPE DATA ---
interface GymClass {
  id: number;
  name: string;
  min_participants: number;
  is_active: boolean;
}

interface Schedule {
  id: number;
  class_id: number;
  class_name: string;
  instructor_id: number;
  instructor_name: string;
  date: string;
  time: string;
  participants_count: number;
  min_participants: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  cancel_reason?: string;
}

export default function Kelas() {
  const [activeTab, setActiveTab] = useState<'kelas' | 'jadwal'>('kelas');
  const [isLoading, setIsLoading] = useState(false);

  // --- STATE KELAS ---
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classForm, setClassForm] = useState<Partial<GymClass>>({ name: '', min_participants: 5, is_active: true });
  const [classError, setClassError] = useState('');

  // --- STATE JADWAL ---
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<Partial<Schedule>>({ class_id: 0, instructor_id: 0, date: '', time: '' });
  const [scheduleError, setScheduleError] = useState('');
  
  // State Batal Jadwal
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Mock Instruktur untuk Dropdown
  const mockInstructors = [
    { id: 1, name: 'Budi Santoso' },
    { id: 2, name: 'Siti Aminah' }
  ];

  // --- INISIALISASI MOCK DATA ---
  useEffect(() => {
    setClasses([
      { id: 1, name: 'Yoga Pemula', min_participants: 5, is_active: true },
      { id: 2, name: 'HIIT Cardio', min_participants: 10, is_active: true },
    ]);
    setSchedules([
      { id: 1, class_id: 1, class_name: 'Yoga Pemula', instructor_id: 1, instructor_name: 'Budi Santoso', date: '2026-10-20', time: '08:00', participants_count: 3, min_participants: 5, status: 'scheduled' }
    ]);
  }, []);

  // --- HANDLER KELAS ---
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setClassError('');
    try {
      await new Promise(res => setTimeout(res, 800)); // Mock API delay
      if (classForm.id) {
        setClasses(prev => prev.map(c => c.id === classForm.id ? { ...c, ...classForm } as GymClass : c));
        // Sinkronisasi nama kelas & min_participants di jadwal terkait jika kelas diedit
        setSchedules(prev => prev.map(s => 
          s.class_id === classForm.id 
            ? { ...s, class_name: classForm.name || s.class_name, min_participants: classForm.min_participants ?? s.min_participants } 
            : s
        ));
      } else {
        setClasses(prev => [...prev, { ...classForm, id: Date.now() } as GymClass]);
      }
      setIsClassModalOpen(false);
    } catch {
      setClassError('Gagal menyimpan kelas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClass = async (id: number) => {
    const hasSchedule = schedules.some(s => s.class_id === id && s.status === 'scheduled');
    if (hasSchedule) {
      alert('Error 409: Tidak dapat menghapus kelas karena masih ada jadwal aktif yang terkait dengan kelas ini.');
      return;
    }
    if (window.confirm('Hapus kelas ini?')) {
      setClasses(prev => prev.filter(c => c.id !== id));
    }
  };

  // --- HANDLER JADWAL ---
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setScheduleError('');
    try {
      await new Promise(res => setTimeout(res, 800)); // Mock API delay
      const selectedClass = classes.find(c => c.id === Number(scheduleForm.class_id));
      const selectedInstructor = mockInstructors.find(i => i.id === Number(scheduleForm.instructor_id));
      
      if (!selectedClass || !selectedInstructor) {
        setScheduleError('Kelas atau instruktur tidak valid.');
        setIsLoading(false);
        return;
      }

      if (scheduleForm.id) {
        // Mode Edit: Pertahankan participants_count, status, dan cancel_reason yang sudah ada
        setSchedules(prev => prev.map(s => {
          if (s.id !== scheduleForm.id) return s;
          return {
            ...s,
            class_id: selectedClass.id,
            class_name: selectedClass.name,
            instructor_id: selectedInstructor.id,
            instructor_name: selectedInstructor.name,
            date: scheduleForm.date!,
            time: scheduleForm.time!,
            min_participants: selectedClass.min_participants,
            participants_count: s.participants_count,
            status: s.status,
            cancel_reason: s.cancel_reason
          };
        }));
      } else {
        // Mode Buat Baru: Set participants_count = 0 dan status = 'scheduled'
        const newSchedule: Schedule = {
          id: Date.now(),
          class_id: selectedClass.id,
          class_name: selectedClass.name,
          instructor_id: selectedInstructor.id,
          instructor_name: selectedInstructor.name,
          date: scheduleForm.date!,
          time: scheduleForm.time!,
          participants_count: 0,
          min_participants: selectedClass.min_participants,
          status: 'scheduled'
        };
        setSchedules(prev => [...prev, newSchedule]);
      }
      setIsScheduleModalOpen(false);
    } catch {
      setScheduleError('Gagal menyimpan jadwal. Pastikan instruktur tidak bentrok.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;
    setIsLoading(true);
    try {
      await new Promise(res => setTimeout(res, 800)); // Mock API delay
      setSchedules(prev => prev.map(s => s.id === cancellingId ? { ...s, status: 'cancelled', cancel_reason: cancelReason } : s));
      setIsCancelModalOpen(false);
      setCancelReason('');
    } finally {
      setIsLoading(false);
    }
  };

  // Opsi kelas untuk dropdown jadwal: tampilkan semua kelas aktif, 
  // ATAU kelas nonaktif yang saat ini sedang dipakai oleh jadwal yang diedit
  const availableClassesForSchedule = classes.filter(
    c => c.is_active || (scheduleForm.id && c.id === Number(scheduleForm.class_id))
  );

  return (
    <div>
      <PageHeader title="Kelas & Jadwal">
        {activeTab === 'kelas' ? (
          <button 
            onClick={() => { setClassForm({ name: '', min_participants: 5, is_active: true }); setIsClassModalOpen(true); }} 
            className="bg-amber-400 hover:bg-amber-500 text-zinc-950 px-4 py-2 rounded-md font-bold text-sm transition-colors"
          >
            + Tambah Kelas
          </button>
        ) : (
          <button 
            onClick={() => { 
              const firstActiveClassId = classes.find(c => c.is_active)?.id || 0;
              setScheduleForm({ class_id: firstActiveClassId, instructor_id: mockInstructors[0].id, date: '', time: '' }); 
              setIsScheduleModalOpen(true); 
            }} 
            className="bg-amber-400 hover:bg-amber-500 text-zinc-950 px-4 py-2 rounded-md font-bold text-sm transition-colors"
          >
            + Buat Jadwal
          </button>
        )}
      </PageHeader>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6 border-b border-zinc-800">
        <button onClick={() => setActiveTab('kelas')} className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'kelas' ? 'border-amber-400 text-amber-400' : 'border-transparent text-zinc-400 hover:text-zinc-300'}`}>Manajemen Kelas</button>
        <button onClick={() => setActiveTab('jadwal')} className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'jadwal' ? 'border-amber-400 text-amber-400' : 'border-transparent text-zinc-400 hover:text-zinc-300'}`}>Jadwal Sesi</button>
      </div>

      {/* Konten Kelas */}
      {activeTab === 'kelas' && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/50 text-zinc-400 uppercase border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Nama Kelas</th>
                <th className="px-6 py-4 font-medium">Min. Peserta</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {classes.map(c => (
                <tr key={c.id} className="hover:bg-zinc-800/50">
                  <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                  <td className="px-6 py-4">{c.min_participants} orang</td>
                  <td className="px-6 py-4">
                    {c.is_active ? <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium">Aktif</span> : <span className="bg-zinc-500/10 text-zinc-400 px-2.5 py-1 rounded-full text-xs font-medium">Nonaktif</span>}
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    <button onClick={() => { setClassForm(c); setIsClassModalOpen(true); }} className="text-amber-400 hover:text-amber-300">Edit</button>
                    <button onClick={() => handleDeleteClass(c.id)} className="text-red-400 hover:text-red-300">Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Konten Jadwal */}
      {activeTab === 'jadwal' && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-950/50 text-zinc-400 uppercase border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Tanggal & Jam</th>
                <th className="px-6 py-4 font-medium">Kelas</th>
                <th className="px-6 py-4 font-medium">Instruktur</th>
                <th className="px-6 py-4 font-medium">Peserta</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {schedules.map(s => (
                <tr key={s.id} className="hover:bg-zinc-800/50">
                  <td className="px-6 py-4"><div className="font-medium text-white">{s.date}</div><div className="text-xs text-zinc-500">{s.time}</div></td>
                  <td className="px-6 py-4 text-white">{s.class_name}</td>
                  <td className="px-6 py-4">{s.instructor_name}</td>
                  <td className="px-6 py-4">{s.participants_count} / {s.min_participants}</td>
                  <td className="px-6 py-4">
                    {s.status === 'scheduled' && <span className="bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full text-xs font-medium">Dijadwalkan</span>}
                    {s.status === 'completed' && <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full text-xs font-medium">Selesai</span>}
                    {s.status === 'cancelled' && <span className="bg-red-500/10 text-red-400 px-2.5 py-1 rounded-full text-xs font-medium">Dibatalkan</span>}
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                    {s.status === 'scheduled' && (
                      <>
                        <button onClick={() => { setScheduleForm(s); setIsScheduleModalOpen(true); }} className="text-amber-400 hover:text-amber-300">Edit</button>
                        <button onClick={() => { setCancellingId(s.id); setIsCancelModalOpen(true); }} className="text-red-400 hover:text-red-300">Batal</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form Kelas */}
      <Modal isOpen={isClassModalOpen} onClose={() => !isLoading && setIsClassModalOpen(false)} title={classForm.id ? "Edit Kelas" : "Tambah Kelas Baru"}>
        <form onSubmit={handleSaveClass} className="space-y-4">
          {classError && <div className="text-red-400 text-sm">{classError}</div>}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Nama Kelas</label>
            <input type="text" required value={classForm.name || ''} onChange={e => setClassForm({...classForm, name: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Minimum Peserta</label>
            <input type="number" min="1" required value={classForm.min_participants ?? 5} onChange={e => setClassForm({...classForm, min_participants: Number(e.target.value)})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
          </div>
          <div className="flex items-center">
            <input type="checkbox" checked={!!classForm.is_active} onChange={e => setClassForm({...classForm, is_active: e.target.checked})} className="w-4 h-4 text-amber-500 bg-zinc-950 border-zinc-700 rounded focus:ring-amber-500" />
            <label className="ml-2 text-sm text-zinc-300">Kelas Aktif</label>
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setIsClassModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white">Batal</button>
            <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-bold bg-amber-400 text-zinc-950 rounded-md hover:bg-amber-500 disabled:opacity-50">Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Form Jadwal */}
      <Modal isOpen={isScheduleModalOpen} onClose={() => !isLoading && setIsScheduleModalOpen(false)} title={scheduleForm.id ? "Edit Jadwal" : "Buat Jadwal Baru"}>
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          {scheduleError && <div className="text-red-400 text-sm">{scheduleError}</div>}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Pilih Kelas</label>
            <select 
              required 
              value={scheduleForm.class_id || 0} 
              onChange={e => setScheduleForm({...scheduleForm, class_id: Number(e.target.value)})} 
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400"
            >
              <option value={0} disabled>-- Pilih Kelas --</option>
              {availableClassesForSchedule.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {!c.is_active ? '(Nonaktif)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Instruktur</label>
            <select 
              required 
              value={scheduleForm.instructor_id || 0} 
              onChange={e => setScheduleForm({...scheduleForm, instructor_id: Number(e.target.value)})} 
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400"
            >
              <option value={0} disabled>-- Pilih Instruktur --</option>
              {mockInstructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Tanggal</label>
              <input type="date" required value={scheduleForm.date || ''} onChange={e => setScheduleForm({...scheduleForm, date: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Jam</label>
              <input type="time" required value={scheduleForm.time || ''} onChange={e => setScheduleForm({...scheduleForm, time: e.target.value})} className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white [color-scheme:dark]" />
            </div>
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white">Batal</button>
            <button type="submit" disabled={isLoading || !scheduleForm.class_id || !scheduleForm.instructor_id} className="px-4 py-2 text-sm font-bold bg-amber-400 text-zinc-950 rounded-md hover:bg-amber-500 disabled:opacity-50">Simpan</button>
          </div>
        </form>
      </Modal>

      {/* Modal Batal Jadwal */}
      <Modal isOpen={isCancelModalOpen} onClose={() => !isLoading && setIsCancelModalOpen(false)} title="Batalkan Jadwal">
        <form onSubmit={handleCancelSchedule} className="space-y-4">
          <p className="text-sm text-zinc-400">Silakan masukkan alasan pembatalan kelas ini. Alasan ini akan terlihat oleh member yang sudah mendaftar.</p>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Alasan Pembatalan</label>
            <textarea required rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Contoh: Instruktur berhalangan hadir..." className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400" />
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={() => setIsCancelModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white">Kembali</button>
            <button type="submit" disabled={isLoading || !cancelReason.trim()} className="px-4 py-2 text-sm font-bold bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50">Konfirmasi Batal</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}