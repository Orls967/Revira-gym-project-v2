import React, { useState, useEffect, useCallback, useRef } from 'react';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
import api from '../lib/api';

// --- TIPE DATA SESUAI KONTRAK AdminTransactionResource.php ---
export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type RecordType = 'registration' | 'extension';
export type PaymentMethod = 'transfer' | 'on_the_spot';

export interface TransactionMember {
  id: number;
  name: string;
  email: string;
  phone_number: string | null;
}

export interface TransactionPlan {
  id: number;
  name: string;
  duration_days: number;
}

export interface AdminTransactionItem {
  id: number;
  member: TransactionMember;
  plan: TransactionPlan;
  record_type: RecordType;
  start_date: string | null;
  amount: number;
  payment_method: PaymentMethod;
  verification_status: VerificationStatus;
  has_receipt: boolean;
  receipt_url: string | null;
  reject_reason: string | null;
  verified_at: string | null;
  created_at: string | null;
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

// --- DATA MOCK FALLBACK (Hanya dipakai bila server belum aktif / offline) ---
const MOCK_TRANSACTIONS: AdminTransactionItem[] = [
  {
    id: 9001,
    member: {
      id: 11,
      name: 'Ahmad Fauzi',
      email: 'ahmad.fauzi@email.com',
      phone_number: '081234567890',
    },
    plan: {
      id: 2,
      name: 'Member Bulanan',
      duration_days: 30,
    },
    record_type: 'registration',
    start_date: '2026-11-15',
    amount: 200000,
    payment_method: 'transfer',
    verification_status: 'pending',
    has_receipt: true,
    receipt_url: '/api/v1/transactions/9001/receipt',
    reject_reason: null,
    verified_at: null,
    created_at: '2026-11-14T09:30:00+08:00',
  },
  {
    id: 9002,
    member: {
      id: 12,
      name: 'Siti Nurhaliza',
      email: 'siti.nur@email.com',
      phone_number: '081345678901',
    },
    plan: {
      id: 3,
      name: 'Member 3 Bulan',
      duration_days: 90,
    },
    record_type: 'extension',
    start_date: '2026-11-16',
    amount: 550000,
    payment_method: 'on_the_spot',
    verification_status: 'pending',
    has_receipt: false,
    receipt_url: null,
    reject_reason: null,
    verified_at: null,
    created_at: '2026-11-14T11:15:00+08:00',
  },
  {
    id: 9003,
    member: {
      id: 13,
      name: 'Rizky Pratama',
      email: 'rizky.pratama@email.com',
      phone_number: '082155667788',
    },
    plan: {
      id: 2,
      name: 'Member Bulanan',
      duration_days: 30,
    },
    record_type: 'registration',
    start_date: '2026-11-10',
    amount: 200000,
    payment_method: 'transfer',
    verification_status: 'verified',
    has_receipt: true,
    receipt_url: '/api/v1/transactions/9003/receipt',
    reject_reason: null,
    verified_at: '2026-11-10T14:20:00+08:00',
    created_at: '2026-11-10T10:00:00+08:00',
  },
  {
    id: 9004,
    member: {
      id: 14,
      name: 'Dewi Lestari',
      email: 'dewi.lestari@email.com',
      phone_number: '085244332211',
    },
    plan: {
      id: 1,
      name: 'Single Pass / Harian',
      duration_days: 1,
    },
    record_type: 'registration',
    start_date: '2026-11-12',
    amount: 25000,
    payment_method: 'transfer',
    verification_status: 'rejected',
    has_receipt: true,
    receipt_url: '/api/v1/transactions/9004/receipt',
    reject_reason: 'Nominal pada bukti transfer tidak sesuai dengan harga paket.',
    verified_at: '2026-11-12T16:45:00+08:00',
    created_at: '2026-11-12T15:10:00+08:00',
  },
];

// --- HELPER FORMATTERS ---
function formatRupiah(amount: number): string {
  const num = Number.isFinite(amount) ? Math.round(amount) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDateTimeWita(isoStr: string | null): string {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return (
    d.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Makassar',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }) +
    ' • ' +
    d.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Makassar',
      hour: '2-digit',
      minute: '2-digit',
    }) +
    ' WITA'
  );
}

function formatDateOnlyWita(dateStr: string | null): string {
  if (!dateStr) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  const d = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`)
    : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isCanceledError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as ApiErrorShape;
  return (
    e.code === 'ERR_CANCELED' ||
    e.name === 'CanceledError' ||
    e.name === 'AbortError'
  );
}

const ZOOM_LEVELS = [1, 1.5, 2, 3] as const;

export default function Transaksi() {
  // --- STATE TAB, DAFTAR & PAGINASI ---
  const [activeStatus, setActiveStatus] = useState<VerificationStatus>('pending');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [transactions, setTransactions] = useState<AdminTransactionItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    current_page: 1,
    last_page: 1,
    per_page: 15,
    total: 0,
    from: null,
    to: null,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string>('');
  const [isUsingMock, setIsUsingMock] = useState<boolean>(false);
  const [banner, setBanner] = useState<BannerNotification | null>(null);

  // --- STATE MODAL DETAIL & BUKTI TRANSFER (BLOB + ZOOM) ---
  const [detailTx, setDetailTx] = useState<AdminTransactionItem | null>(null);
  const [receiptObjectUrl, setReceiptObjectUrl] = useState<string | null>(null);
  const [isReceiptLoading, setIsReceiptLoading] = useState<boolean>(false);
  const [receiptError, setReceiptError] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const receiptObjectUrlRef = useRef<string | null>(null);
  const receiptAbortRef = useRef<AbortController | null>(null);

  // --- STATE MODAL KONFIRMASI SETUJUI (APPROVE - B4) ---
  const [approveTx, setApproveTx] = useState<AdminTransactionItem | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approveError, setApproveError] = useState<string>('');

  // --- STATE MODAL TOLAK DENGAN ALASAN WAJIB (REJECT - B5) ---
  const [rejectTx, setRejectTx] = useState<AdminTransactionItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [rejectError, setRejectError] = useState<string>('');

  // Helper untuk membersihkan ObjectURL bukti transfer agar tidak bocor di memori browser
  const revokeCurrentReceiptUrl = useCallback(() => {
    if (receiptAbortRef.current) {
      receiptAbortRef.current.abort();
      receiptAbortRef.current = null;
    }
    if (receiptObjectUrlRef.current) {
      URL.revokeObjectURL(receiptObjectUrlRef.current);
      receiptObjectUrlRef.current = null;
    }
    setReceiptObjectUrl(null);
  }, []);

  // --- FETCH DAFTAR TRANSAKSI DARI GET /api/v1/admin/transactions ---
  const fetchTransactions = useCallback(
    async (statusParam: VerificationStatus, pageParam: number) => {
      setIsLoading(true);
      setFetchError('');

      try {
        const res = await api.get('/admin/transactions', {
          params: {
            status: statusParam,
            page: pageParam,
          },
        });

        const rawData = res.data?.data;
        const rawMeta = res.data?.meta;

        if (!Array.isArray(rawData)) {
          throw new Error('Format respons transaksi tidak valid.');
        }

        setTransactions(rawData as AdminTransactionItem[]);
        setIsUsingMock(false);

        if (rawMeta && typeof rawMeta === 'object') {
          setMeta({
            current_page: Number(rawMeta.current_page) || pageParam,
            last_page: Number(rawMeta.last_page) || 1,
            per_page: Number(rawMeta.per_page) || 15,
            total: Number(rawMeta.total) || rawData.length,
            from: rawMeta.from ?? null,
            to: rawMeta.to ?? null,
          });
        } else {
          setMeta({
            current_page: 1,
            last_page: 1,
            per_page: 15,
            total: rawData.length,
            from: rawData.length > 0 ? 1 : null,
            to: rawData.length > 0 ? rawData.length : null,
          });
        }
      } catch (err: unknown) {
        const apiErr = err as ApiErrorShape;
        const statusCode = apiErr.response?.status;

        // Jika server belum hidup (network error) atau endpoint 404 sebelum merge, gunakan mock fallback
        if (!statusCode || statusCode === 404) {
          const filteredMocks = MOCK_TRANSACTIONS.filter(
            (item) => item.verification_status === statusParam
          );
          setTransactions(filteredMocks);
          setIsUsingMock(true);
          setMeta({
            current_page: 1,
            last_page: 1,
            per_page: 15,
            total: filteredMocks.length,
            from: filteredMocks.length > 0 ? 1 : null,
            to: filteredMocks.length > 0 ? filteredMocks.length : null,
          });
        } else {
          setFetchError(
            apiErr.response?.data?.message ||
              'Gagal memuat daftar transaksi dari server.'
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchTransactions(activeStatus, currentPage);
  }, [activeStatus, currentPage, fetchTransactions]);

  // --- FETCH GAMBAR BUKTI TRANSFER SEBAGAI BLOB (DENGAN HEADER AUTHORIZATION) ---
  const loadReceiptBlob = useCallback(
    async (tx: AdminTransactionItem) => {
      revokeCurrentReceiptUrl();
      setReceiptError('');
      setZoomLevel(1);

      // Transaksi bayar di tempat atau tanpa bukti tidak memanggil endpoint receipt (AC2)
      if (tx.payment_method === 'on_the_spot' || !tx.has_receipt) {
        setIsReceiptLoading(false);
        return;
      }

      const controller = new AbortController();
      receiptAbortRef.current = controller;
      setIsReceiptLoading(true);

      try {
        const response = await api.get(`/transactions/${tx.id}/receipt`, {
          responseType: 'blob',
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const blob: Blob = response.data;
        if (!blob || blob.size === 0) {
          throw new Error('File bukti transfer kosong.');
        }

        const objectUrl = URL.createObjectURL(blob);
        receiptObjectUrlRef.current = objectUrl;
        setReceiptObjectUrl(objectUrl);
      } catch (err: unknown) {
        if (isCanceledError(err)) return;
        const apiErr = err as ApiErrorShape;
        if (apiErr.response?.status === 404) {
          setReceiptError('File bukti transfer tidak ditemukan di server (404).');
        } else if (apiErr.response?.status === 403) {
          setReceiptError('Anda tidak memiliki akses untuk melihat bukti ini (403).');
        } else {
          setReceiptError(
            'Gagal memuat gambar bukti transfer dari endpoint privat.'
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsReceiptLoading(false);
        }
      }
    },
    [revokeCurrentReceiptUrl]
  );

  // Cleanup ObjectURL saat komponen unmount
  useEffect(() => {
    return () => {
      revokeCurrentReceiptUrl();
    };
  }, [revokeCurrentReceiptUrl]);

  // --- HANDLER BUKA / TUTUP MODAL DETAIL & BUKTI ---
  const openDetailModal = (tx: AdminTransactionItem) => {
    setDetailTx(tx);
    loadReceiptBlob(tx);
  };

  const closeDetailModal = () => {
    setDetailTx(null);
    revokeCurrentReceiptUrl();
    setReceiptError('');
    setZoomLevel(1);
  };

  // --- HANDLER SETUJUI TRANSAKSI (APPROVE - SCRUM-67 / B4) ---
  const openApproveModal = (tx: AdminTransactionItem) => {
    setApproveError('');
    setApproveTx(tx);
  };

  const handleConfirmApprove = async () => {
    if (!approveTx || isApproving) return;
    const targetTx = approveTx;

    setIsApproving(true);
    setApproveError('');

    try {
      if (isUsingMock) {
        setTransactions((prev) => prev.filter((item) => item.id !== targetTx.id));
        setApproveTx(null);
        if (detailTx?.id === targetTx.id) closeDetailModal();
        setBanner({
          type: 'success',
          message: `Transaksi #${targetTx.id} (${targetTx.member.name}) berhasil disetujui.`,
        });
        return;
      }

      const res = await api.post(`/admin/transactions/${targetTx.id}/approve`);
      const serverMessage: string =
        res.data?.message ||
        'Transaksi disetujui. Membership member sudah aktif.';

      // Hilangkan baris dari tab Menunggu secara instan & sinkronkan ulang daftar
      setTransactions((prev) => prev.filter((item) => item.id !== targetTx.id));
      setApproveTx(null);
      if (detailTx?.id === targetTx.id) {
        closeDetailModal();
      }

      setBanner({
        type: 'success',
        message: serverMessage,
      });

      const nextPage =
        transactions.length === 1 && currentPage > 1
          ? currentPage - 1
          : currentPage;
      if (nextPage !== currentPage) {
        setCurrentPage(nextPage);
      } else {
        await fetchTransactions(activeStatus, nextPage);
      }
    } catch (err: unknown) {
      const apiErr = err as ApiErrorShape;
      const status = apiErr.response?.status;
      const errMsg =
        apiErr.response?.data?.message ||
        'Terjadi kesalahan saat menyetujui transaksi.';

      // Langkah 5: Tangani 409 Conflict (sudah diproses admin lain / periode bertabrakan)
      if (status === 409) {
        setApproveTx(null);
        if (detailTx?.id === targetTx.id) {
          closeDetailModal();
        }
        setBanner({
          type: 'warning',
          message: `Konflik (409): ${errMsg} Daftar transaksi telah dimuat ulang.`,
        });
        await fetchTransactions(activeStatus, currentPage);
      } else {
        setApproveError(errMsg);
      }
    } finally {
      setIsApproving(false);
    }
  };

  // --- HANDLER TOLAK TRANSAKSI (REJECT WAJIB ALASAN - SCRUM-67 / B5) ---
  const openRejectModal = (tx: AdminTransactionItem) => {
    setRejectError('');
    setRejectReason('');
    setRejectTx(tx);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTx || isRejecting) return;

    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      setRejectError('Alasan penolakan wajib diisi.');
      return;
    }
    if (trimmedReason.length > 255) {
      setRejectError('Alasan penolakan maksimal 255 karakter.');
      return;
    }

    const targetTx = rejectTx;
    setIsRejecting(true);
    setRejectError('');

    try {
      if (isUsingMock) {
        setTransactions((prev) => prev.filter((item) => item.id !== targetTx.id));
        setRejectTx(null);
        setRejectReason('');
        if (detailTx?.id === targetTx.id) closeDetailModal();
        setBanner({
          type: 'success',
          message: `Transaksi #${targetTx.id} (${targetTx.member.name}) telah ditolak.`,
        });
        return;
      }

      const res = await api.post(`/admin/transactions/${targetTx.id}/reject`, {
        reject_reason: trimmedReason,
      });
      const serverMessage: string = res.data?.message || 'Transaksi ditolak.';

      // Hilangkan baris dari tab Menunggu secara instan & sinkronkan ulang daftar
      setTransactions((prev) => prev.filter((item) => item.id !== targetTx.id));
      setRejectTx(null);
      setRejectReason('');
      if (detailTx?.id === targetTx.id) {
        closeDetailModal();
      }

      setBanner({
        type: 'success',
        message: serverMessage,
      });

      const nextPage =
        transactions.length === 1 && currentPage > 1
          ? currentPage - 1
          : currentPage;
      if (nextPage !== currentPage) {
        setCurrentPage(nextPage);
      } else {
        await fetchTransactions(activeStatus, nextPage);
      }
    } catch (err: unknown) {
      const apiErr = err as ApiErrorShape;
      const status = apiErr.response?.status;
      const validationMsg =
        apiErr.response?.data?.errors?.reject_reason?.[0] ||
        apiErr.response?.data?.message ||
        'Terjadi kesalahan saat menolak transaksi.';

      // Langkah 5: Tangani 409 Conflict (sudah diproses admin lain)
      if (status === 409) {
        setRejectTx(null);
        setRejectReason('');
        if (detailTx?.id === targetTx.id) {
          closeDetailModal();
        }
        setBanner({
          type: 'warning',
          message: `Konflik (409): ${validationMsg} Daftar transaksi telah dimuat ulang.`,
        });
        await fetchTransactions(activeStatus, currentPage);
      } else {
        setRejectError(validationMsg);
      }
    } finally {
      setIsRejecting(false);
    }
  };

  const handleTabChange = (nextStatus: VerificationStatus) => {
    if (nextStatus === activeStatus) return;
    setActiveStatus(nextStatus);
    setCurrentPage(1);
    setBanner(null);
  };

  return (
    <div>
      <PageHeader title="Verifikasi Transaksi Membership">
        <button
          type="button"
          onClick={() => fetchTransactions(activeStatus, currentPage)}
          disabled={isLoading}
          className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Memuat...' : 'Muat Ulang'}
        </button>
      </PageHeader>

      {/* Banner Notifikasi Sukses / Konflik 409 / Error */}
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

      {/* Indikator Fallback Mock bila Server belum jalan */}
      {isUsingMock && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 text-xs font-medium">
          Menampilkan data contoh (mock) karena endpoint server belum terhubung.
        </div>
      )}

      {/* Filter Tab Status: Menunggu, Disetujui, Ditolak */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-gray-300 pb-3">
        <div className="flex space-x-2">
          {(
            [
              { key: 'pending', label: 'Menunggu Verifikasi' },
              { key: 'verified', label: 'Disetujui' },
              { key: 'rejected', label: 'Ditolak' },
            ] as const
          ).map((tab) => {
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-amber-400 text-zinc-950 shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="text-xs font-medium text-gray-600">
          Total: <span className="font-bold text-gray-900">{meta.total}</span> transaksi
        </div>
      </div>

      {/* State Loading / Error / Tabel Transaksi */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, idx) => (
            <div
              key={idx}
              className="h-16 bg-zinc-900/90 animate-pulse rounded-xl border border-zinc-800"
            />
          ))}
        </div>
      ) : fetchError ? (
        <div className="bg-zinc-900 border border-red-500/40 text-red-400 p-8 rounded-xl text-center">
          <p className="mb-4 text-sm font-medium">{fetchError}</p>
          <button
            type="button"
            onClick={() => fetchTransactions(activeStatus, currentPage)}
            className="bg-amber-400 hover:bg-amber-500 text-zinc-950 font-bold px-5 py-2 rounded-md text-sm transition-colors"
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
                  <th className="px-5 py-4 font-semibold">Tanggal Pengajuan</th>
                  <th className="px-5 py-4 font-semibold">Member</th>
                  <th className="px-5 py-4 font-semibold">Paket</th>
                  <th className="px-5 py-4 font-semibold">Jenis</th>
                  <th className="px-5 py-4 font-semibold">Tanggal Mulai</th>
                  <th className="px-5 py-4 font-semibold">Nominal</th>
                  <th className="px-5 py-4 font-semibold">Metode Bayar</th>
                  <th className="px-5 py-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-12 text-center text-zinc-500 text-sm"
                    >
                      Tidak ada transaksi pada tab{' '}
                      <span className="font-semibold text-zinc-400">
                        {activeStatus === 'pending'
                          ? 'Menunggu Verifikasi'
                          : activeStatus === 'verified'
                          ? 'Disetujui'
                          : 'Ditolak'}
                      </span>
                      .
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isTransfer = tx.payment_method === 'transfer';
                    const isRegistration = tx.record_type === 'registration';

                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-zinc-800/40 transition-colors align-top"
                      >
                        {/* 1. Tanggal Pengajuan */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-medium text-white">
                            {formatDateTimeWita(tx.created_at)}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            ID #{tx.id}
                          </div>
                        </td>

                        {/* 2. Member */}
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">
                            {tx.member?.name || '-'}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {tx.member?.email || '-'}
                          </div>
                          {tx.member?.phone_number && (
                            <div className="text-xs text-zinc-500">
                              {tx.member.phone_number}
                            </div>
                          )}
                        </td>

                        {/* 3. Paket */}
                        <td className="px-5 py-4">
                          <div className="font-medium text-white">
                            {tx.plan?.name || '-'}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {tx.plan?.duration_days
                              ? `${tx.plan.duration_days} Hari`
                              : '-'}
                          </div>
                        </td>

                        {/* 4. Jenis (Pendaftaran / Perpanjangan) */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {isRegistration ? (
                            <span className="inline-block bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                              Pendaftaran
                            </span>
                          ) : (
                            <span className="inline-block bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                              Perpanjangan
                            </span>
                          )}
                        </td>

                        {/* 5. Tanggal Mulai */}
                        <td className="px-5 py-4 whitespace-nowrap font-medium text-zinc-200">
                          {formatDateOnlyWita(tx.start_date)}
                        </td>

                        {/* 6. Nominal */}
                        <td className="px-5 py-4 whitespace-nowrap font-bold text-amber-400">
                          {formatRupiah(tx.amount)}
                        </td>

                        {/* 7. Metode Bayar & Penanda Bukti (AC2) */}
                        <td className="px-5 py-4">
                          {isTransfer ? (
                            <div>
                              <span className="inline-block bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-medium">
                                Transfer Bank
                              </span>
                              <div className="text-xs text-zinc-400 mt-1">
                                {tx.has_receipt
                                  ? '📎 Bukti transfer tersedia'
                                  : 'Tanpa bukti'}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-block bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1 rounded-full text-xs font-medium">
                                Bayar di Tempat
                              </span>
                              <div className="text-xs text-amber-400/90 mt-1 font-medium">
                                Bayar di tempat, tanpa bukti
                              </div>
                            </div>
                          )}

                          {/* Tampilkan alasan tolak bila berada di tab Ditolak */}
                          {tx.verification_status === 'rejected' &&
                            tx.reject_reason && (
                              <div className="mt-2 p-2 rounded bg-red-950/40 border border-red-900/50 text-xs text-red-300 max-w-xs">
                                <span className="font-semibold">Alasan Tolak:</span>{' '}
                                {tx.reject_reason}
                              </div>
                            )}
                        </td>

                        {/* 8. Aksi */}
                        <td className="px-5 py-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => openDetailModal(tx)}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-md text-xs font-semibold transition-colors"
                          >
                            {isTransfer && tx.has_receipt
                              ? 'Lihat Bukti'
                              : 'Detail'}
                          </button>

                          {tx.verification_status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openApproveModal(tx)}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-md text-xs font-bold transition-colors"
                              >
                                Setujui
                              </button>
                              <button
                                type="button"
                                onClick={() => openRejectModal(tx)}
                                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-md text-xs font-bold transition-colors"
                              >
                                Tolak
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Kontrol Paginasi Server-Side */}
          {meta.last_page > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
              <span className="text-xs text-zinc-400">
                Menampilkan {meta.from ?? 0}–{meta.to ?? 0} dari {meta.total} data
                {' • '}Halaman {meta.current_page} dari {meta.last_page}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={meta.current_page <= 1 || isLoading}
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-md text-xs font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={meta.current_page >= meta.last_page || isLoading}
                  onClick={() =>
                    setCurrentPage((prev) =>
                      Math.min(meta.last_page, prev + 1)
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

      {/* =====================================================================
          MODAL 1: PANEL DETAIL & PREVIEW/ZOOM BUKTI TRANSFER (LEBAR / DESKTOP)
         ===================================================================== */}
      {detailTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header Modal Detail */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Detail Transaksi #{detailTx.id}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Diajukan pada {formatDateTimeWita(detailTx.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                className="text-zinc-400 hover:text-white text-lg px-2 py-1 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body Modal Detail */}
            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Kolom Kiri: Ringkasan Data Transaksi */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-zinc-500 block">Member</span>
                    <span className="font-bold text-white block">
                      {detailTx.member?.name || '-'}
                    </span>
                    <span className="text-xs text-zinc-400 block">
                      {detailTx.member?.email || '-'}
                    </span>
                    {detailTx.member?.phone_number && (
                      <span className="text-xs text-zinc-400 block">
                        WA: {detailTx.member.phone_number}
                      </span>
                    )}
                  </div>

                  <div className="border-t border-zinc-800 pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-zinc-500 block">Paket</span>
                      <span className="font-semibold text-white">
                        {detailTx.plan?.name || '-'}
                      </span>
                      <span className="text-xs text-zinc-400 block">
                        {detailTx.plan?.duration_days} Hari
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 block">Jenis</span>
                      <span className="font-semibold text-white">
                        {detailTx.record_type === 'registration'
                          ? 'Pendaftaran Baru'
                          : 'Perpanjangan'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-zinc-500 block">
                        Tanggal Mulai
                      </span>
                      <span className="font-semibold text-white">
                        {formatDateOnlyWita(detailTx.start_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 block">
                        Nominal
                      </span>
                      <span className="font-bold text-amber-400 text-base">
                        {formatRupiah(detailTx.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-zinc-500 block">
                        Metode Pembayaran
                      </span>
                      <span className="font-semibold text-white">
                        {detailTx.payment_method === 'transfer'
                          ? 'Transfer Bank'
                          : 'Bayar di Tempat'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500 block">
                        Status Verifikasi
                      </span>
                      <span
                        className={`font-bold ${
                          detailTx.verification_status === 'verified'
                            ? 'text-emerald-400'
                            : detailTx.verification_status === 'rejected'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {detailTx.verification_status === 'verified'
                          ? 'Disetujui'
                          : detailTx.verification_status === 'rejected'
                          ? 'Ditolak'
                          : 'Menunggu'}
                      </span>
                    </div>
                  </div>

                  {detailTx.verified_at && (
                    <div className="border-t border-zinc-800 pt-3">
                      <span className="text-xs text-zinc-500 block">
                        Waktu Diproses
                      </span>
                      <span className="text-xs text-zinc-300">
                        {formatDateTimeWita(detailTx.verified_at)}
                      </span>
                    </div>
                  )}

                  {detailTx.reject_reason && (
                    <div className="border-t border-zinc-800 pt-3">
                      <span className="text-xs text-red-400 font-semibold block">
                        Alasan Penolakan
                      </span>
                      <p className="text-xs text-red-300 mt-1 italic">
                        {detailTx.reject_reason}
                      </p>
                    </div>
                  )}
                </div>

                {/* Tombol Aksi Langsung dari Panel Detail bila masih Pending */}
                {detailTx.verification_status === 'pending' && (
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => openApproveModal(detailTx)}
                      className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-sm rounded-lg transition-colors"
                    >
                      Setujui Transaksi
                    </button>
                    <button
                      type="button"
                      onClick={() => openRejectModal(detailTx)}
                      className="flex-1 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold text-sm rounded-lg transition-colors"
                    >
                      Tolak Transaksi
                    </button>
                  </div>
                )}
              </div>

              {/* Kolom Kanan: Preview & Zoom Bukti Transfer (AC2) */}
              <div className="lg:col-span-7 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Bukti Pembayaran
                  </span>

                  {/* Kontrol Zoom bila gambar bukti sudah termuat */}
                  {receiptObjectUrl && (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs text-zinc-400 mr-1">Zoom:</span>
                      {ZOOM_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setZoomLevel(lvl)}
                          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                            zoomLevel === lvl
                              ? 'bg-amber-400 text-zinc-950'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {lvl * 100}%
                        </button>
                      ))}
                      <a
                        href={receiptObjectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-zinc-800 text-amber-400 hover:bg-zinc-700 ml-2"
                      >
                        Layar Penuh ↗
                      </a>
                    </div>
                  )}
                </div>

                {/* Area Tampilan Bukti */}
                <div className="flex-1 min-h-[340px] max-h-[520px] bg-zinc-950 border border-zinc-800 rounded-xl overflow-auto flex items-center justify-center p-4">
                  {detailTx.payment_method === 'on_the_spot' ||
                  !detailTx.has_receipt ? (
                    <div className="text-center p-8">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-3 text-xl">
                        💵
                      </div>
                      <p className="text-base font-bold text-white">
                        Bayar di tempat, tanpa bukti
                      </p>
                      <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                        Transaksi ini menggunakan metode pembayaran langsung di
                        kasir gym sehingga tidak memerlukan unggahan bukti
                        transfer.
                      </p>
                    </div>
                  ) : isReceiptLoading ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto mb-3" />
                      <p className="text-xs text-zinc-400">
                        Mengambil bukti transfer terautentikasi...
                      </p>
                    </div>
                  ) : receiptError ? (
                    <div className="text-center p-6">
                      <p className="text-sm text-red-400 mb-3">
                        {receiptError}
                      </p>
                      <button
                        type="button"
                        onClick={() => loadReceiptBlob(detailTx)}
                        className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 rounded-md text-xs font-semibold"
                      >
                        Muat Ulang Bukti
                      </button>
                    </div>
                  ) : receiptObjectUrl ? (
                    <div className="overflow-auto max-w-full max-h-full flex items-center justify-center">
                      <img
                        src={receiptObjectUrl}
                        alt={`Bukti transfer transaksi #${detailTx.id}`}
                        onClick={() =>
                          setZoomLevel((prev) => (prev >= 2 ? 1 : prev + 0.5))
                        }
                        style={{
                          transform: `scale(${zoomLevel})`,
                          transformOrigin: 'top center',
                          transition: 'transform 150ms ease-out',
                        }}
                        className="max-w-full max-h-[460px] object-contain rounded-lg cursor-zoom-in"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Footer Modal Detail */}
            <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-950/50 flex justify-end">
              <button
                type="button"
                onClick={closeDetailModal}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-sm font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: DIALOG KONFIRMASI SETUJUI TRANSAKSI (APPROVE - B4)
         ===================================================================== */}
      <Modal
        isOpen={Boolean(approveTx)}
        onClose={() => !isApproving && setApproveTx(null)}
        title="Konfirmasi Setujui Transaksi"
      >
        {approveTx && (
          <div className="space-y-4">
            {approveError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                {approveError}
              </div>
            )}

            <p className="text-sm text-zinc-300">
              Apakah Anda yakin ingin menyetujui transaksi ini dan mengaktifkan
              membership untuk member berikut?
            </p>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-400">Member:</span>
                <span className="font-semibold text-white">
                  {approveTx.member?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Paket:</span>
                <span className="font-semibold text-white">
                  {approveTx.plan?.name} ({approveTx.plan?.duration_days} Hari)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Tanggal Mulai:</span>
                <span className="font-semibold text-white">
                  {formatDateOnlyWita(approveTx.start_date)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Nominal:</span>
                <span className="font-bold text-amber-400">
                  {formatRupiah(approveTx.amount)}
                </span>
              </div>
            </div>

            <div className="pt-3 flex justify-end space-x-3">
              <button
                type="button"
                disabled={isApproving}
                onClick={() => setApproveTx(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isApproving}
                onClick={handleConfirmApprove}
                className="px-4 py-2 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-md transition-colors disabled:opacity-50"
              >
                {isApproving ? 'Memproses...' : 'Ya, Setujui'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =====================================================================
          MODAL 3: DIALOG TOLAK TRANSAKSI DENGAN ALASAN WAJIB (REJECT - B5)
         ===================================================================== */}
      <Modal
        isOpen={Boolean(rejectTx)}
        onClose={() => !isRejecting && setRejectTx(null)}
        title="Tolak Transaksi Membership"
      >
        {rejectTx && (
          <form onSubmit={handleConfirmReject} className="space-y-4">
            {rejectError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                {rejectError}
              </div>
            )}

            <p className="text-sm text-zinc-300">
              Masukkan alasan penolakan untuk transaksi{' '}
              <span className="font-semibold text-white">
                {rejectTx.member?.name}
              </span>{' '}
              ({rejectTx.plan?.name} - {formatRupiah(rejectTx.amount)}).
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-zinc-300">
                  Alasan Penolakan <span className="text-red-400">*</span>
                </label>
                <span
                  className={`text-xs ${
                    rejectReason.length > 255
                      ? 'text-red-400 font-bold'
                      : 'text-zinc-500'
                  }`}
                >
                  {rejectReason.length}/255
                </span>
              </div>
              <textarea
                required
                rows={3}
                maxLength={255}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError('');
                }}
                placeholder="Contoh: Bukti transfer buram / nominal pembayaran tidak sesuai..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:ring-amber-400 focus:border-amber-400"
              />
            </div>

            <div className="pt-3 flex justify-end space-x-3">
              <button
                type="button"
                disabled={isRejecting}
                onClick={() => setRejectTx(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={
                  isRejecting ||
                  rejectReason.trim().length === 0 ||
                  rejectReason.trim().length > 255
                }
                className="px-4 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRejecting ? 'Menolak...' : 'Konfirmasi Tolak'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}