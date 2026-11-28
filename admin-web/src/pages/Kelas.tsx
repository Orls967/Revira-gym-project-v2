import React, { useState, useEffect, useCallback, useRef } from 'react';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
import api from '../lib/api';

// --- TIPE DATA SESUAI KONTRAK BACKEND (GymClassResource, InstructorResource, ClassScheduleResource) ---
interface GymClass {
  id: number;
  name: string;
  description?: string | null;
  min_participants: number;
  default_instructor_id?: number | null;
  is_active: boolean;
}

interface Instructor {
  id: number;
  name: string;
  specialization?: string | null;
  phone_number?: string | null;
  is_active: boolean;
}

type ScheduleStatus = 'scheduled' | 'ongoing' | 'completed' | 'cancelled';

interface ClassSchedule {
  id: number;
  class_id: number;
  class_name: string;
  instructor_id: number;
  instructor_name: string;
  schedule_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  status: ScheduleStatus;
  cancel_reason: string | null;
  participants_count: number;
  min_participants: number | null;
}

interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface ApiErrorShape {
  name?: string;
  code?: string;
  response?: {
    status?: number;
    data?: {
      message?: string;
      errors?: Record<string, string[]>;
    };
  };
  message?: string;
}

interface BannerNotification {
  type: 'success' | 'error' | 'warning';
  message: string;
}

// --- HELPER FUNCTIONS ---
function isCanceledError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as ApiErrorShape;
  return (
    e.code === 'ERR_CANCELED' ||
    e.name === 'CanceledError' ||
    e.name === 'AbortError'
  );
}

function extractApiErrorMessage(err: unknown, fallback: string): string {
  const apiErr = err as ApiErrorShape;
  const fieldErrors = apiErr.response?.data?.errors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    const firstKey = Object.keys(fieldErrors)[0];
    if (firstKey && Array.isArray(fieldErrors[firstKey]) && fieldErrors[firstKey][0]) {
      return fieldErrors[firstKey][0];
    }
  }
  return apiErr.response?.data?.message || fallback;
}

// Parse tanggal YYYY-MM-DD + jam HH:MM(:SS) secara eksplisit pada zona waktu WITA (+08:00)
function parseWitaDateTimeMs(dateStr: string, timeStr: string): number {
  if (!dateStr || !timeStr) return Number.NaN;
  const cleanTime = timeStr.trim();
  const fullTime = /^\d{2}:\d{2}$/.test(cleanTime) ? `${cleanTime}:00` : cleanTime;
  return new Date(`${dateStr.trim()}T${fullTime}+08:00`).getTime();
}

function formatDateWita(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(`${dateStr.trim()}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function Kelas() {
  const [activeTab, setActiveTab] = useState<'kelas' | 'jadwal'>('jadwal');
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  // Jam lokal WITA (diperbarui berkala agar tombol Batal otomatis tersembunyi saat sesi dimulai - B9)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // --- STATE KELAS & INSTRUKTUR ---
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [isLoadingMaster, setIsLoadingMaster] = useState<boolean>(true);
  const [masterError, setMasterError] = useState<string>('');

  const [isClassModalOpen, setIsClassModalOpen] = useState<boolean>(false);
  const [isSavingClass, setIsSavingClass] = useState<boolean>(false);
  const [classForm, setClassForm] = useState<{
    id?: number;
    name: string;
    min_participants: number;
    is_active: boolean;
  }>({ name: '', min_participants: 5, is_active: true });
  const [classError, setClassError] = useState<string>('');

  // --- STATE JADWAL SESI ---
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [schedulePage, setSchedulePage] = useState<number>(1);
  const [scheduleMeta, setScheduleMeta] = useState<PaginationMeta>({
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: 0,
    from: null,
    to: null,
  });
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(true);
  const [schedulesError, setSchedulesError] = useState<string>('');

  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);
  const [scheduleForm, setScheduleForm] = useState<{
    id?: number;
    class_id: number;
    instructor_id: number;
    schedule_date: string;
    start_time: string;
    end_time: string;
  }>({
    class_id: 0,
    instructor_id: 0,
    schedule_date: '',
    start_time: '',
    end_time: '',
  });
  const [scheduleError, setScheduleError] = useState<string>('');

  // --- STATE MODAL BATAL JADWAL (SCRUM-95 / B9) ---
  const [cancellingSchedule, setCancellingSchedule] = useState<ClassSchedule | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelError, setCancelError] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Refs untuk AbortController mencegah race condition
  const scheduleAbortRef = useRef<AbortController | null>(null);
  const scheduleSeqRef = useRef<number>(0);

  // Perbarui jam lokal setiap 15 detik agar aturan B9 selalu akurat di layar
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // --- FETCH MASTER DATA (KELAS & INSTRUKTUR) DARI API ASLI ---
  const fetchMasterData = useCallback(async () => {
    setIsLoadingMaster(true);
    setMasterError('');
    try {
      const [clsRes, instRes] = await Promise.all([
        api.get('/admin/classes', { params: { per_page: 100 } }),
        api.get('/admin/instructors', { params: { per_page: 100 } }),
      ]);
      setClasses(Array.isArray(clsRes.data?.data) ? clsRes.data.data : []);
      setInstructors(Array.isArray(instRes.data?.data) ? instRes.data.data : []);
    } catch (err: unknown) {
      setMasterError(
        extractApiErrorMessage(err, 'Gagal memuat data kelas dan instruktur dari server.')
      );
    } finally {
      setIsLoadingMaster(false);
    }
  }, []);

  // --- FETCH JADWAL SESI DARI GET /api/v1/admin/class-schedules ---
  const fetchSchedules = useCallback(async (pageParam: number) => {
    if (scheduleAbortRef.current) {
      scheduleAbortRef.current.abort();
    }
    const controller = new AbortController();
    scheduleAbortRef.current = controller;
    const reqSeq = ++scheduleSeqRef.current;

    setIsLoadingSchedules(true);
    setSchedulesError('');

    try {
      const res = await api.get('/admin/class-schedules', {
        params: { page: pageParam, per_page: 15 },
        signal: controller.signal,
      });

      if (controller.signal.aborted || reqSeq !== scheduleSeqRef.current) {
        return;
      }

      const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
      const rawMeta = res.data?.meta;

      setSchedules(rawList as ClassSchedule[]);
      setNowMs(Date.now());

      if (rawMeta && typeof rawMeta === 'object') {
        setScheduleMeta({
          current_page: Number(rawMeta.current_page) || pageParam,
          last_page: Number(rawMeta.last_page) || 1,
          per_page: Number(rawMeta.per_page) || 15,
          total: Number(rawMeta.total) || rawList.length,
          from: rawMeta.from ?? null,
          to: rawMeta.to ?? null,
        });
      } else {
        setScheduleMeta({
          current_page: 1,
          last_page: 1,
          per_page: 15,
          total: rawList.length,
          from: rawList.length > 0 ? 1 : null,
          to: rawList.length > 0 ? rawList.length : null,
        });
      }
    } catch (err: unknown) {
      if (isCanceledError(err) || reqSeq !== scheduleSeqRef.current) return;
      setSchedulesError(
        extractApiErrorMessage(err, 'Gagal memuat daftar jadwal sesi dari server.')
      );
    } finally {
      if (reqSeq === scheduleSeqRef.current) {
        setIsLoadingSchedules(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  useEffect(() => {
    fetchSchedules(schedulePage);
  }, [schedulePage, fetchSchedules]);

  useEffect(() => {
    return () => {
      if (scheduleAbortRef.current) {
        scheduleAbortRef.current.abort();
        scheduleAbortRef.current = null;
      }
    };
  }, []);

  // --- HANDLER KELAS ---
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingClass(true);
    setClassError('');

    const payload = {
      name: classForm.name.trim(),
      min_participants: Number(classForm.min_participants),
      is_active: classForm.is_active,
    };

    try {
      if (classForm.id) {
        await api.put(`/admin/classes/${classForm.id}`, payload);
      } else {
        await api.post('/admin/classes', payload);
      }

      setIsClassModalOpen(false);
      setBanner({
        type: 'success',
        message: classForm.id
          ? 'Data kelas berhasil diperbarui.'
          : 'Kelas baru berhasil ditambahkan.',
      });
      await Promise.all([fetchMasterData(), fetchSchedules(schedulePage)]);
    } catch (err: unknown) {
      setClassError(
        extractApiErrorMessage(err, 'Gagal menyimpan data kelas ke server.')
      );
    } finally {
      setIsSavingClass(false);
    }
  };

  const handleDeleteClass = async (id: number) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus kelas ini?')) return;

    try {
      await api.delete(`/admin/classes/${id}`);
      setBanner({
        type: 'success',
        message: 'Kelas berhasil dihapus.',
      });
      await fetchMasterData();
    } catch (err: unknown) {
      const apiErr = err as ApiErrorShape;
      const msg = extractApiErrorMessage(err, 'Gagal menghapus kelas.');
      setBanner({
        type: apiErr.response?.status === 409 ? 'warning' : 'error',
        message: msg,
      });
    }
  };

  // --- HANDLER BUAT / EDIT JADWAL ---
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError('');

    if (scheduleForm.end_time <= scheduleForm.start_time) {
      setScheduleError('Jam selesai harus setelah jam mulai.');
      return;
    }

    setIsSavingSchedule(true);

    const payload = {
      class_id: Number(scheduleForm.class_id),
      instructor_id: Number(scheduleForm.instructor_id),
      schedule_date: scheduleForm.schedule_date,
      start_time: scheduleForm.start_time.substring(0, 5),
      end_time: scheduleForm.end_time.substring(0, 5),
    };

    try {
      if (scheduleForm.id) {
        await api.put(`/admin/class-schedules/${scheduleForm.id}`, payload);
      } else {
        await api.post('/admin/class-schedules', payload);
      }

      setIsScheduleModalOpen(false);
      setBanner({
        type: 'success',
        message: scheduleForm.id
          ? 'Jadwal sesi berhasil diperbarui.'
          : 'Jadwal sesi baru berhasil dibuat.',
      });
      await fetchSchedules(schedulePage);
    } catch (err: unknown) {
      setScheduleError(
        extractApiErrorMessage(
          err,
          'Gagal menyimpan jadwal. Pastikan jadwal instruktur tidak bentrok.'
        )
      );
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // --- HANDLER BATALKAN JADWAL (PATCH /api/v1/admin/class-schedules/{id}/status - SCRUM-94 & SCRUM-95) ---
  const openCancelModal = (schedule: ClassSchedule) => {
    setCancellingSchedule(schedule);
    setCancelReason('');
    setCancelError('');
  };

  const closeCancelModal = () => {
    if (isCancelling) return;
    setCancellingSchedule(null);
    setCancelReason('');
    setCancelError('');
  };

  const handleCancelSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSchedule || isCancelling) return;

    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      setCancelError('Alasan pembatalan wajib diisi.');
      return;
    }
    if (trimmedReason.length > 255) {
      setCancelError('Alasan pembatalan maksimal 255 karakter.');
      return;
    }

    const targetSchedule = cancellingSchedule;
    setIsCancelling(true);
    setCancelError('');

    try {
      const res = await api.patch(
        `/admin/class-schedules/${targetSchedule.id}/status`,
        {
          status: 'cancelled',
          cancel_reason: trimmedReason,
        }
      );

      const cancelledCount = Number(res.data?.meta?.cancelled_bookings_count ?? 0);

      setCancellingSchedule(null);
      setCancelReason('');
      setBanner({
        type: 'success',
        message: `Jadwal "${targetSchedule.class_name}" berhasil dibatalkan. ${cancelledCount} booking member ikut dibatalkan.`,
      });

      await fetchSchedules(schedulePage);
    } catch (err: unknown) {
      const apiErr = err as ApiErrorShape;
      const status = apiErr.response?.status;
      const errMsg = extractApiErrorMessage(err, 'Gagal membatalkan jadwal.');

      // Langkah 3: Tangani HTTP 422 (mis. sesi sudah dimulai atau status sudah berubah di server)
      if (status === 422) {
        setCancelError(errMsg);
        await fetchSchedules(schedulePage);
      } else {
        setCancelError(errMsg);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  // Hitung jumlah sesi scheduled yang pesertanya di bawah minimum pada halaman aktif
  const underMinCount = schedules.filter(
    (s) =>
      s.status === 'scheduled' &&
      typeof s.min_participants === 'number' &&
      s.participants_count < s.min_participants
  ).length;

  // Filter dropdown jadwal: sertakan kelas/instruktur aktif atau yang sedang dipakai saat edit
  const availableClassesForSchedule = classes.filter(
    (c) => c.is_active || (scheduleForm.id && c.id === Number(scheduleForm.class_id))
  );
  const availableInstructorsForSchedule = instructors.filter(
    (i) => i.is_active || (scheduleForm.id && i.id === Number(scheduleForm.instructor_id))
  );

  return (
    <div>
      <PageHeader title="Kelas & Jadwal">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              fetchMasterData();
              fetchSchedules(schedulePage);
            }}
            disabled={isLoadingMaster || isLoadingSchedules}
            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 px-3.5 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
          >
            Muat Ulang
          </button>

          {activeTab === 'kelas' ? (
            <button
              type="button"
              onClick={() => {
                setClassForm({ name: '', min_participants: 5, is_active: true });
                setClassError('');
                setIsClassModalOpen(true);
              }}
              className="bg-amber-400 hover:bg-amber-500 text-zinc-950 px-4 py-2 rounded-md font-bold text-sm transition-colors"
            >
              + Tambah Kelas
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const firstActiveClassId = classes.find((c) => c.is_active)?.id || 0;
                const firstActiveInstId = instructors.find((i) => i.is_active)?.id || 0;
                setScheduleForm({
                  class_id: firstActiveClassId,
                  instructor_id: firstActiveInstId,
                  schedule_date: '',
                  start_time: '08:00',
                  end_time: '09:00',
                });
                setScheduleError('');
                setIsScheduleModalOpen(true);
              }}
              className="bg-amber-400 hover:bg-amber-500 text-zinc-950 px-4 py-2 rounded-md font-bold text-sm transition-colors"
            >
              + Buat Jadwal
            </button>
          )}
        </div>
      </PageHeader>

      {/* Banner Notifikasi Sukses / Peringatan / Error */}
      {banner && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : banner.type === 'warning'
              ? 'bg-amber-950 text-amber-300 border-amber-800'
              : 'bg-red-950 text-red-300 border-red-800'
          }`}
        >
          <span className="text-sm font-medium">{banner.message}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="ml-4 text-xs font-bold uppercase tracking-wider opacity-80 hover:opacity-100"
          >
            Tutup ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-gray-300 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('jadwal')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'jadwal'
              ? 'bg-amber-400 text-zinc-950 shadow-sm'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          <span>Jadwal Sesi</span>
          {underMinCount > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                activeTab === 'jadwal'
                  ? 'bg-zinc-950 text-amber-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {underMinCount} kurang peserta
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('kelas')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === 'kelas'
              ? 'bg-amber-400 text-zinc-950 shadow-sm'
              : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          Manajemen Kelas
        </button>
      </div>

      {/* ================= KONTEN TAB MANAJEMEN KELAS ================= */}
      {activeTab === 'kelas' && (
        <>
          {isLoadingMaster ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, idx) => (
                <div
                  key={idx}
                  className="h-14 bg-zinc-900/90 animate-pulse rounded-xl border border-zinc-800"
                />
              ))}
            </div>
          ) : masterError ? (
            <div className="bg-zinc-900 border border-red-500/40 text-red-400 p-8 rounded-xl text-center">
              <p className="mb-4 text-sm font-medium">{masterError}</p>
              <button
                type="button"
                onClick={fetchMasterData}
                className="bg-amber-400 hover:bg-amber-500 text-zinc-950 font-bold px-5 py-2 rounded-md text-sm"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="bg-zinc-950/60 text-zinc-400 uppercase text-xs border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Nama Kelas</th>
                    <th className="px-6 py-4 font-semibold">Min. Peserta</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {classes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                        Belum ada data kelas.
                      </td>
                    </tr>
                  ) : (
                    classes.map((c) => (
                      <tr key={c.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{c.name}</td>
                        <td className="px-6 py-4">{c.min_participants} orang</td>
                        <td className="px-6 py-4">
                          {c.is_active ? (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                              Aktif
                            </span>
                          ) : (
                            <span className="bg-zinc-500/10 text-zinc-400 border border-zinc-700 px-2.5 py-1 rounded-full text-xs font-medium">
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right space-x-3">
                          <button
                            type="button"
                            onClick={() => {
                              setClassForm({
                                id: c.id,
                                name: c.name,
                                min_participants: c.min_participants,
                                is_active: c.is_active,
                              });
                              setClassError('');
                              setIsClassModalOpen(true);
                            }}
                            className="text-amber-400 hover:text-amber-300 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClass(c.id)}
                            className="text-red-400 hover:text-red-300 font-medium"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ================= KONTEN TAB JADWAL SESI (SCRUM-95) ================= */}
      {activeTab === 'jadwal' && (
        <>
          {isLoadingSchedules ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, idx) => (
                <div
                  key={idx}
                  className="h-16 bg-zinc-900/90 animate-pulse rounded-xl border border-zinc-800"
                />
              ))}
            </div>
          ) : schedulesError ? (
            <div className="bg-zinc-900 border border-red-500/40 text-red-400 p-8 rounded-xl text-center">
              <p className="mb-4 text-sm font-medium">{schedulesError}</p>
              <button
                type="button"
                onClick={() => fetchSchedules(schedulePage)}
                className="bg-amber-400 hover:bg-amber-500 text-zinc-950 font-bold px-5 py-2 rounded-md text-sm"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-zinc-300">
                  <thead className="bg-zinc-950/60 text-zinc-400 uppercase text-xs border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Tanggal & Jam (WITA)</th>
                      <th className="px-6 py-4 font-semibold">Kelas</th>
                      <th className="px-6 py-4 font-semibold">Instruktur</th>
                      <th className="px-6 py-4 font-semibold">Peserta / Minimum</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {schedules.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-zinc-500">
                          Belum ada jadwal sesi yang dibuat.
                        </td>
                      </tr>
                    ) : (
                      schedules.map((s) => {
                        const hasMin =
                          typeof s.min_participants === 'number' &&
                          Number.isFinite(s.min_participants);
                        const isBelowMin =
                          s.status === 'scheduled' &&
                          hasMin &&
                          s.participants_count < (s.min_participants as number);

                        // B9: Sesi yang sudah dimulai atau selesai tidak boleh dibatalkan
                        const startMs = parseWitaDateTimeMs(s.schedule_date, s.start_time);
                        const hasStarted = Number.isFinite(startMs) && nowMs >= startMs;
                        const canCancel = s.status === 'scheduled' && !hasStarted;

                        return (
                          <tr
                            key={s.id}
                            className={`transition-colors align-top ${
                              isBelowMin
                                ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1]'
                                : 'hover:bg-zinc-800/40'
                            }`}
                          >
                            {/* Tanggal & Jam */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-white">
                                {formatDateWita(s.schedule_date)}
                              </div>
                              <div className="text-xs text-amber-400 font-medium mt-0.5">
                                {s.start_time} - {s.end_time} WITA
                              </div>
                            </td>

                            {/* Nama Kelas */}
                            <td className="px-6 py-4">
                              <div className="font-semibold text-white">
                                {s.class_name || '-'}
                              </div>
                              {s.status === 'cancelled' && s.cancel_reason && (
                                <div className="mt-1.5 p-2 rounded bg-red-950/40 border border-red-900/50 text-xs text-red-300 max-w-xs italic">
                                  Alasan batal: {s.cancel_reason}
                                </div>
                              )}
                            </td>

                            {/* Instruktur */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {s.instructor_name || '-'}
                            </td>

                            {/* Peserta vs Minimum + Badge "Kurang peserta" (Langkah 1 / AC3) */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-bold ${
                                    isBelowMin ? 'text-amber-400' : 'text-white'
                                  }`}
                                >
                                  {s.participants_count} / {hasMin ? s.min_participants : '-'}
                                </span>
                                {isBelowMin && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    Kurang peserta
                                  </span>
                                )}
                              </div>
                              {isBelowMin && hasMin && (
                                <div className="text-[11px] text-amber-400/80 mt-0.5">
                                  Kurang {(s.min_participants as number) - s.participants_count} peserta dari minimum
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {s.status === 'scheduled' && (
                                <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                                  Dijadwalkan
                                </span>
                              )}
                              {s.status === 'ongoing' && (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                                  Berlangsung
                                </span>
                              )}
                              {s.status === 'completed' && (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                                  Selesai
                                </span>
                              )}
                              {s.status === 'cancelled' && (
                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                                  Dibatalkan
                                </span>
                              )}
                            </td>

                            {/* Aksi (B9: Tombol Batal disembunyikan bila sesi sudah dimulai atau selesai) */}
                            <td className="px-6 py-4 text-right whitespace-nowrap space-x-2">
                              {s.status === 'scheduled' && !hasStarted && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setScheduleForm({
                                      id: s.id,
                                      class_id: s.class_id,
                                      instructor_id: s.instructor_id,
                                      schedule_date: s.schedule_date,
                                      start_time: s.start_time,
                                      end_time: s.end_time,
                                    });
                                    setScheduleError('');
                                    setIsScheduleModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 rounded-md text-xs font-semibold transition-colors"
                                >
                                  Edit
                                </button>
                              )}

                              {canCancel && (
                                <button
                                  type="button"
                                  onClick={() => openCancelModal(s)}
                                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-md text-xs font-bold transition-colors"
                                >
                                  Batal
                                </button>
                              )}

                              {!canCancel && s.status === 'scheduled' && hasStarted && (
                                <span className="text-xs text-zinc-500 italic">
                                  Sudah dimulai
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginasi Jadwal Server-Side */}
              {scheduleMeta.last_page > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
                  <span className="text-xs text-zinc-400">
                    Menampilkan {scheduleMeta.from ?? 0}–{scheduleMeta.to ?? 0} dari{' '}
                    {scheduleMeta.total} jadwal • Halaman {scheduleMeta.current_page} dari{' '}
                    {scheduleMeta.last_page}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={scheduleMeta.current_page <= 1 || isLoadingSchedules}
                      onClick={() => setSchedulePage((prev) => Math.max(1, prev - 1))}
                      className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-md text-xs font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      disabled={
                        scheduleMeta.current_page >= scheduleMeta.last_page ||
                        isLoadingSchedules
                      }
                      onClick={() =>
                        setSchedulePage((prev) =>
                          Math.min(scheduleMeta.last_page, prev + 1)
                        )
                      }
                      className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-md text-xs font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================= MODAL FORM KELAS ================= */}
      <Modal
        isOpen={isClassModalOpen}
        onClose={() => !isSavingClass && setIsClassModalOpen(false)}
        title={classForm.id ? 'Edit Kelas' : 'Tambah Kelas Baru'}
      >
        <form onSubmit={handleSaveClass} className="space-y-4">
          {classError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
              {classError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Nama Kelas
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={classForm.name}
              onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Minimum Peserta
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              required
              value={classForm.min_participants}
              onChange={(e) =>
                setClassForm({
                  ...classForm,
                  min_participants: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400 focus:border-amber-400"
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="classIsActive"
              checked={classForm.is_active}
              onChange={(e) =>
                setClassForm({ ...classForm, is_active: e.target.checked })
              }
              className="w-4 h-4 text-amber-500 bg-zinc-950 border-zinc-700 rounded focus:ring-amber-500"
            />
            <label htmlFor="classIsActive" className="ml-2 text-sm text-zinc-300">
              Kelas Aktif
            </label>
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              disabled={isSavingClass}
              onClick={() => setIsClassModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSavingClass}
              className="px-4 py-2 text-sm font-bold bg-amber-400 text-zinc-950 rounded-md hover:bg-amber-500 disabled:opacity-50"
            >
              {isSavingClass ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================= MODAL FORM JADWAL ================= */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => !isSavingSchedule && setIsScheduleModalOpen(false)}
        title={scheduleForm.id ? 'Edit Jadwal Sesi' : 'Buat Jadwal Sesi Baru'}
      >
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          {scheduleError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
              {scheduleError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Pilih Kelas
            </label>
            <select
              required
              value={scheduleForm.class_id}
              onChange={(e) =>
                setScheduleForm({ ...scheduleForm, class_id: Number(e.target.value) })
              }
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400"
            >
              <option value={0} disabled>
                -- Pilih Kelas --
              </option>
              {availableClassesForSchedule.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {!c.is_active ? '(Nonaktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Instruktur
            </label>
            <select
              required
              value={scheduleForm.instructor_id}
              onChange={(e) =>
                setScheduleForm({
                  ...scheduleForm,
                  instructor_id: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white focus:ring-amber-400"
            >
              <option value={0} disabled>
                -- Pilih Instruktur --
              </option>
              {availableInstructorsForSchedule.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {!i.is_active ? '(Nonaktif)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              Tanggal Sesi
            </label>
            <input
              type="date"
              required
              value={scheduleForm.schedule_date}
              onChange={(e) =>
                setScheduleForm({ ...scheduleForm, schedule_date: e.target.value })
              }
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white [color-scheme:dark]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Jam Mulai (WITA)
              </label>
              <input
                type="time"
                required
                value={scheduleForm.start_time}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, start_time: e.target.value })
                }
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Jam Selesai (WITA)
              </label>
              <input
                type="time"
                required
                value={scheduleForm.end_time}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, end_time: e.target.value })
                }
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              disabled={isSavingSchedule}
              onClick={() => setIsScheduleModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={
                isSavingSchedule ||
                !scheduleForm.class_id ||
                !scheduleForm.instructor_id
              }
              className="px-4 py-2 text-sm font-bold bg-amber-400 text-zinc-950 rounded-md hover:bg-amber-500 disabled:opacity-50"
            >
              {isSavingSchedule ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================= MODAL BATAL JADWAL (SCRUM-95 / AC3 / B9) ================= */}
      <Modal
        isOpen={Boolean(cancellingSchedule)}
        onClose={closeCancelModal}
        title="Batalkan Jadwal Sesi"
      >
        {cancellingSchedule && (
          <form onSubmit={handleCancelSchedule} className="space-y-4">
            {cancelError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-md text-sm">
                {cancelError}
              </div>
            )}

            {/* Ringkasan Sesi */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3.5 text-sm space-y-1">
              <div className="font-bold text-white">
                {cancellingSchedule.class_name}
              </div>
              <div className="text-xs text-zinc-400">
                {formatDateWita(cancellingSchedule.schedule_date)} •{' '}
                <span className="text-amber-400 font-medium">
                  {cancellingSchedule.start_time} - {cancellingSchedule.end_time} WITA
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                Instruktur: {cancellingSchedule.instructor_name}
              </div>
            </div>

            {/* Langkah 2: Informasi dampak jumlah booking member yang akan ikut dibatalkan */}
            <div
              className={`p-3.5 rounded-lg border text-sm ${
                cancellingSchedule.participants_count > 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              {cancellingSchedule.participants_count > 0 ? (
                <>
                  <span className="font-bold text-amber-400">
                    {cancellingSchedule.participants_count} booking member
                  </span>{' '}
                  yang terdaftar pada sesi ini akan ikut dibatalkan secara otomatis.
                </>
              ) : (
                <>
                  Saat ini belum ada member yang mem-booking sesi ini (
                  <span className="font-semibold text-white">0 booking</span>{' '}
                  terdampak).
                </>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-zinc-300">
                  Alasan Pembatalan <span className="text-red-400">*</span>
                </label>
                <span
                  className={`text-xs ${
                    cancelReason.length > 255
                      ? 'text-red-400 font-bold'
                      : 'text-zinc-500'
                  }`}
                >
                  {cancelReason.length}/255
                </span>
              </div>
              <textarea
                required
                rows={3}
                maxLength={255}
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (cancelError) setCancelError('');
                }}
                placeholder="Contoh: Jumlah peserta belum memenuhi kuota minimum..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:ring-amber-400 focus:border-amber-400"
              />
            </div>

            <div className="pt-3 flex justify-end space-x-3">
              <button
                type="button"
                disabled={isCancelling}
                onClick={closeCancelModal}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={
                  isCancelling ||
                  cancelReason.trim().length === 0 ||
                  cancelReason.trim().length > 255
                }
                className="px-4 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCancelling ? 'Membatalkan...' : 'Konfirmasi Batal'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}