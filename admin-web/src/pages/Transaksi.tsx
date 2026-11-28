import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import PageHeader from '../components/common/PageHeader';
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

type TransactionRow = AdminTransactionItem & { source: 'api' | 'mock' };
type TransactionView = { status: VerificationStatus; page: number };
type Decision = { action: 'approve' | 'reject'; target: TransactionRow };

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
  type: 'success' | 'warning';
  message: string;
}

const USE_MOCK = import.meta.env.DEV && import.meta.env.VITE_SCRUM75_MOCK === 'true';
const PAGE_SIZE = 15;
const REQUEST_TIMEOUT = 15_000;
const RECEIPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Fixture sintetis untuk mode mock development yang diaktifkan secara eksplisit.
const INITIAL_MOCK_TRANSACTIONS: AdminTransactionItem[] = [
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

function TransactionDialog({
  open,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      className={'m-auto border-0 bg-transparent p-0 text-zinc-200 backdrop:bg-black/75 backdrop:backdrop-blur-sm ' + className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function DecisionDialog({
  open,
  onClose,
  title,
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <TransactionDialog
      open={open}
      onClose={onClose}
      label={title}
      className="w-[calc(100%-2rem)] max-w-lg max-h-[92vh] rounded-xl border border-zinc-800 shadow-xl"
    >
      <div className="bg-zinc-900">
        <header className="flex items-center justify-between border-b border-zinc-800 p-6">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Tutup dialog">✕</button>
        </header>
        <div className="p-6">{children}</div>
      </div>
    </TransactionDialog>
  );
}

export default function Transaksi() {
  const [view, setView] = useState<TransactionView>({ status: 'pending', page: 1 });
  const { status: activeStatus, page: currentPage } = view;
  const viewRef = useRef(view);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    current_page: 1, last_page: 1, per_page: PAGE_SIZE, total: 0, from: null, to: null,
  });
  const [listedStatus, setListedStatus] = useState<VerificationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [banner, setBanner] = useState<BannerNotification | null>(null);
  const mockStore = useRef<TransactionRow[]>(
    INITIAL_MOCK_TRANSACTIONS.map((item) => ({ ...item, source: 'mock' })),
  );
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchSeqRef = useRef(0);
  const mountedRef = useRef(false);

  const [detailTx, setDetailTx] = useState<TransactionRow | null>(null);
  const detailRef = useRef<TransactionRow | null>(null);
  const [receiptObjectUrl, setReceiptObjectUrl] = useState<string | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<number | null>(null);
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const receiptObjectUrlRef = useRef<string | null>(null);
  const receiptAbortRef = useRef<AbortController | null>(null);

  const [decision, setDecision] = useState<Decision | null>(null);
  const decisionLock = useRef<Decision | null>(null);
  const needsRecheck = useRef(new Set<number>());
  const [isDeciding, setIsDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const approveTx = decision?.action === 'approve' ? decision.target : null;
  const rejectTx = decision?.action === 'reject' ? decision.target : null;
  const trimmedReason = rejectReason.trim();
  const reasonLength = Array.from(trimmedReason).length;

  const fetchTransactions = useCallback(async (requested: TransactionView) => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const seq = ++fetchSeqRef.current;
    const isCurrent = () => !controller.signal.aborted && seq === fetchSeqRef.current;
    setIsLoading(true);
    setFetchError('');

    let page = requested.page;
    try {
      // Setiap koreksi hanya dapat menurunkan nomor halaman dalam request ini.
      for (;;) {
        let rows: TransactionRow[];
        let pagination: PaginationMeta;
        if (USE_MOCK) {
          rows = mockStore.current.filter((item) => item.verification_status === requested.status);
          pagination = {
            current_page: 1, last_page: 1, per_page: PAGE_SIZE, total: rows.length,
            from: rows.length ? 1 : null, to: rows.length || null,
          };
        } else {
          const { data } = await api.get<{ data: AdminTransactionItem[]; meta: PaginationMeta }>(
            '/admin/transactions',
            {
              params: { status: requested.status, page },
              signal: controller.signal,
              timeout: REQUEST_TIMEOUT,
            },
          );
          if (!isCurrent()) return;
          if (!Array.isArray(data?.data) || !Number.isInteger(data?.meta?.last_page) ||
              data.meta.last_page < 1 || !Number.isInteger(data.meta.total) || data.meta.total < 0) {
            throw new Error('Format respons transaksi tidak valid.');
          }
          pagination = data.meta;
          rows = data.data.map((item) => ({ ...item, source: 'api' }));
        }

        const lastPage = pagination.total === 0 ? 1 : pagination.last_page;
        if (page > lastPage) {
          page = lastPage;
          const correctedView = { status: requested.status, page };
          viewRef.current = correctedView;
          setView(correctedView);
          continue;
        }

        for (const row of rows) {
          if (row.source === 'api') needsRecheck.current.delete(row.id);
        }
        setTransactions(rows);
        setMeta(pagination);
        setListedStatus(requested.status);
        return;
      }
    } catch (err: unknown) {
      if (!isCurrent() || isCanceledError(err)) return;
      const apiErr = err as ApiErrorShape;
      setFetchError(apiErr.response?.data?.message ||
        'Gagal memuat daftar transaksi dari server. Coba lagi.');
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  const disposeReceipt = useCallback(() => {
    receiptAbortRef.current?.abort();
    receiptAbortRef.current = null;
    if (receiptObjectUrlRef.current) {
      URL.revokeObjectURL(receiptObjectUrlRef.current);
      receiptObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchTransactions(viewRef.current);
    return () => {
      mountedRef.current = false;
      fetchAbortRef.current?.abort();
      disposeReceipt();
    };
  }, [disposeReceipt, fetchTransactions]);

  const navigateList = (nextView: TransactionView) => {
    viewRef.current = nextView;
    setView(nextView);
    void fetchTransactions(nextView);
  };

  const resetReceipt = () => {
    disposeReceipt();
    setReceiptObjectUrl(null);
    setReceiptWidth(null);
    setReceiptError('');
    setIsReceiptLoading(false);
    setZoomLevel(1);
  };

  const loadReceiptBlob = async (tx: TransactionRow) => {
    resetReceipt();
    if (tx.source === 'mock' || tx.payment_method === 'on_the_spot' || !tx.has_receipt) return;

    const controller = new AbortController();
    receiptAbortRef.current = controller;
    const isCurrent = () => !controller.signal.aborted && receiptAbortRef.current === controller;
    setIsReceiptLoading(true);

    try {
      const { data: blob } = await api.get<Blob>('/transactions/' + tx.id + '/receipt', {
        responseType: 'blob',
        signal: controller.signal,
        timeout: REQUEST_TIMEOUT,
      });
      if (!isCurrent()) return;

      if (!blob?.size || !RECEIPT_TYPES.has(blob.type.toLowerCase())) {
        setReceiptError(!blob?.size
          ? 'File bukti transfer kosong.'
          : 'Format bukti transfer tidak didukung. Gunakan JPEG, PNG, atau WebP.');
        setIsReceiptLoading(false);
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      receiptObjectUrlRef.current = objectUrl;
      setReceiptObjectUrl(objectUrl);
    } catch (err: unknown) {
      if (!isCurrent() || isCanceledError(err)) return;
      const status = (err as ApiErrorShape).response?.status;
      setReceiptError(status === 404
        ? 'File bukti transfer tidak ditemukan di server (404).'
        : status === 403
          ? 'Anda tidak memiliki akses untuk melihat bukti ini (403).'
          : 'Gagal memuat gambar bukti transfer dari endpoint privat.');
      setIsReceiptLoading(false);
    }
  };

  const openDetailModal = (tx: TransactionRow) => {
    if (decisionLock.current) return;
    detailRef.current = tx;
    setDetailTx(tx);
    void loadReceiptBlob(tx);
  };

  const closeDetailModal = () => {
    if (decisionLock.current) return;
    detailRef.current = null;
    setDetailTx(null);
    resetReceipt();
  };

  const openDecision = (action: Decision['action'], target: TransactionRow) => {
    if (decisionLock.current || (target.source === 'api' && needsRecheck.current.has(target.id))) return;
    setDecision({ action, target });
    setDecisionError('');
    setRejectReason('');
  };

  const closeDecision = () => {
    if (!decisionLock.current) setDecision(null);
  };

  const confirmDecision = async (submitted: Decision) => {
    const { action, target } = submitted;
    if (decisionLock.current || (target.source === 'api' && needsRecheck.current.has(target.id))) return;
    if (action === 'reject' && (reasonLength === 0 || reasonLength > 255)) {
      setDecisionError(reasonLength === 0
        ? 'Alasan penolakan wajib diisi.'
        : 'Alasan penolakan maksimal 255 karakter.');
      return;
    }

    decisionLock.current = submitted;
    setIsDeciding(true);
    setDecisionError('');

    const finishDecision = () => {
      setDecision((current) => current === submitted ? null : current);
      if (detailRef.current === target) {
        detailRef.current = null;
        setDetailTx(null);
        resetReceipt();
      }
    };

    const fallbackMessage = action === 'approve'
      ? 'Transaksi disetujui. Membership member sudah aktif.'
      : 'Transaksi ditolak.';
    const payload = action === 'reject' ? { reject_reason: trimmedReason } : undefined;

    try {
      let message: string;
      if (target.source === 'mock') {
        mockStore.current = mockStore.current.map((item) => item.id === target.id
          ? {
              ...item,
              verification_status: action === 'approve' ? 'verified' : 'rejected',
              verified_at: new Date().toISOString(),
              reject_reason: payload?.reject_reason ?? null,
            }
          : item);
        message = 'Simulasi: transaksi #' + target.id +
          (action === 'approve' ? ' disetujui.' : ' ditolak.');
      } else {
        const { data } = await api.post<{ message?: string }>(
          '/admin/transactions/' + target.id + '/' + action,
          payload,
          { timeout: REQUEST_TIMEOUT },
        );
        message = data?.message || fallbackMessage;
      }

      if (!mountedRef.current) return;
      finishDecision();
      setTransactions((rows) => rows.filter((row) => row.source !== target.source || row.id !== target.id));
      setBanner({ type: 'success', message });
      await fetchTransactions(viewRef.current);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      const apiErr = err as ApiErrorShape;
      const status = apiErr.response?.status;
      const message = apiErr.response?.data?.message;
      const unknownOutcome = target.source === 'api' && (!status || status === 408 || status >= 500);
      if (status === 409 || unknownOutcome) {
        if (unknownOutcome) needsRecheck.current.add(target.id);
        finishDecision();
        setBanner({
          type: 'warning',
          message: status === 409
            ? (message || 'Terjadi konflik saat memproses transaksi (409).')
            : 'Hasil keputusan belum dapat dipastikan. Periksa status transaksi sebelum mencoba lagi.',
        });
        await fetchTransactions(viewRef.current);
      } else {
        setDecisionError(apiErr.response?.data?.errors?.reject_reason?.[0] ||
          message || 'Gagal memproses transaksi.');
      }
    } finally {
      decisionLock.current = null;
      if (mountedRef.current) setIsDeciding(false);
    }
  };

  const handleTabChange = (nextStatus: VerificationStatus) => {
    if (nextStatus === viewRef.current.status) return;
    setBanner(null);
    navigateList({ status: nextStatus, page: 1 });
  };

  return (
    <div>
      <PageHeader title="Verifikasi Transaksi Membership">
        <button
          type="button"
          onClick={() => void fetchTransactions(viewRef.current)}
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
              : 'bg-amber-950 text-amber-300 border-amber-800'
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

      {/* Indikator Fallback Mock (hanya tampil di mode development) */}
      {USE_MOCK && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 text-xs font-medium">
          Mode simulasi development. Daftar dan keputusan memakai data contoh.
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
          Total: <span className="font-bold text-gray-900">{isLoading || fetchError ? '—' : meta.total}</span> transaksi
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
            onClick={() => void fetchTransactions(viewRef.current)}
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
                                  : 'Bukti transfer tidak tersedia'}
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
                                onClick={() => openDecision('approve', tx)}
                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-md text-xs font-bold transition-colors"
                              >
                                Setujui
                              </button>
                              <button
                                type="button"
                                onClick={() => openDecision('reject', tx)}
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

        </div>
      )}

      {/* Kontrol Paginasi Server-Side */}
      {listedStatus === activeStatus && !fetchError && meta.last_page > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
          <span className="text-xs text-zinc-400">
            Menampilkan {isLoading ? '…' : (meta.from ?? 0) + '–' + (meta.to ?? 0)} dari {meta.total} data
            {' • '}Halaman {currentPage} dari {meta.last_page}
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() =>
                navigateList({ ...viewRef.current, page: Math.max(1, viewRef.current.page - 1) })
              }
              className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-md text-xs font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={currentPage >= meta.last_page}
              onClick={() =>
                navigateList({ ...viewRef.current, page: Math.min(meta.last_page, viewRef.current.page + 1) })
              }
              className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-md text-xs font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: PANEL DETAIL & PREVIEW/ZOOM BUKTI TRANSFER (LEBAR / DESKTOP)
         ===================================================================== */}
      {detailTx && (
        <TransactionDialog
          open
          onClose={closeDetailModal}
          label={'Detail Transaksi #' + detailTx.id}
          className="w-[calc(100%-2rem)] max-w-4xl max-h-[92vh] overflow-hidden"
        >
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
                      onClick={() => openDecision('approve', detailTx)}
                      className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-sm rounded-lg transition-colors"
                    >
                      Setujui Transaksi
                    </button>
                    <button
                      type="button"
                      onClick={() => openDecision('reject', detailTx)}
                      className="flex-1 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold text-sm rounded-lg transition-colors"
                    >
                      Tolak Transaksi
                    </button>
                  </div>
                )}
              </div>

              {/* Kolom Kanan: Preview & Zoom Bukti Transfer (AC2) */}
              <div className="lg:col-span-7 min-w-0 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Bukti Pembayaran
                  </span>

                  {/* Kontrol Zoom bila gambar bukti sudah termuat */}
                  {receiptObjectUrl && receiptWidth !== null && (
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

                {/* Area Tampilan Bukti (Kondisi on_the_spot dipisahkan dari transfer tanpa bukti) */}
                <div className="flex-1 min-h-[340px] max-h-[520px] bg-zinc-950 border border-zinc-800 rounded-xl overflow-auto p-4">
                  {detailTx.payment_method === 'on_the_spot' ? (
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
                  ) : !detailTx.has_receipt ? (
                    <div className="text-center p-8">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-3 text-xl">
                        📄
                      </div>
                      <p className="text-base font-bold text-white">
                        Bukti transfer tidak tersedia
                      </p>
                      <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                        Transaksi ini menggunakan metode transfer bank, tetapi
                        file bukti transfer belum tersedia atau tidak tercatat.
                      </p>
                    </div>
                  ) : detailTx.source === 'mock' ? (
                    <p className="p-8 text-center text-zinc-300">Preview bukti tidak tersedia dalam mode simulasi.</p>
                  ) : isReceiptLoading && !receiptObjectUrl ? (
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
                    <img
                      key={receiptObjectUrl}
                      src={receiptObjectUrl}
                      alt={'Bukti transfer transaksi #' + detailTx.id}
                      onLoad={(event) => {
                        if (receiptObjectUrlRef.current !== receiptObjectUrl) return;
                        const image = event.currentTarget;
                        setReceiptWidth(Math.min(image.naturalWidth, 460 * image.naturalWidth / image.naturalHeight));
                        setIsReceiptLoading(false);
                      }}
                      onError={() => {
                        if (receiptObjectUrlRef.current !== receiptObjectUrl) return;
                        resetReceipt();
                        setReceiptError('Gambar bukti transfer rusak atau tidak dapat dibaca.');
                      }}
                      onClick={() => {
                        if (receiptWidth !== null) setZoomLevel((prev) => (prev >= 2 ? 1 : prev + 0.5));
                      }}
                      style={{
                        width: receiptWidth === null
                          ? '100%'
                          : 'min(' + (zoomLevel * 100) + '%, ' + (zoomLevel * receiptWidth) + 'px)',
                      }}
                      className={'mx-auto block h-auto max-w-none rounded-lg cursor-zoom-in' +
                        (isReceiptLoading ? ' invisible' : '')}
                    />
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
        </TransactionDialog>
      )}

      {/* =====================================================================
          MODAL 2: DIALOG KONFIRMASI SETUJUI TRANSAKSI (APPROVE - B4)
         ===================================================================== */}
      <DecisionDialog
        open={Boolean(approveTx)}
        onClose={closeDecision}
        title="Konfirmasi Setujui Transaksi"
        busy={isDeciding}
      >
        {approveTx && (
          <div className="space-y-4">
            {decisionError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                {decisionError}
              </div>
            )}

            <p className="text-sm text-zinc-300">
              Apakah Anda yakin ingin menyetujui transaksi #{approveTx.id} dan mengaktifkan
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
                disabled={isDeciding}
                onClick={closeDecision}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeciding}
                onClick={() => { if (decision) void confirmDecision(decision); }}
                className="px-4 py-2 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-md transition-colors disabled:opacity-50"
              >
                {isDeciding ? 'Memproses...' : 'Ya, Setujui'}
              </button>
            </div>
          </div>
        )}
      </DecisionDialog>

      {/* =====================================================================
          MODAL 3: DIALOG TOLAK TRANSAKSI DENGAN ALASAN WAJIB (REJECT - B5)
         ===================================================================== */}
      <DecisionDialog
        open={Boolean(rejectTx)}
        onClose={closeDecision}
        title="Tolak Transaksi Membership"
        busy={isDeciding}
      >
        {rejectTx && (
          <form onSubmit={(event) => {
            event.preventDefault();
            if (decision) void confirmDecision(decision);
          }} className="space-y-4">
            {decisionError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-md text-sm">
                {decisionError}
              </div>
            )}

            <p className="text-sm text-zinc-300">
              Masukkan alasan penolakan untuk transaksi #{rejectTx.id} milik{' '}
              <span className="font-semibold text-white">
                {rejectTx.member?.name}
              </span>{' '}
              ({rejectTx.plan?.name} - {formatRupiah(rejectTx.amount)}).
            </p>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="scrum75-reject-reason" className="block text-sm font-medium text-zinc-300">
                  Alasan Penolakan <span className="text-red-400">*</span>
                </label>
                <span
                  className={`text-xs ${
                    reasonLength > 255
                      ? 'text-red-400 font-bold'
                      : 'text-zinc-500'
                  }`}
                >
                  {reasonLength}/255
                </span>
              </div>
              <textarea
                id="scrum75-reject-reason"
                required
                disabled={isDeciding}
                rows={3}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (decisionError) setDecisionError('');
                }}
                placeholder="Contoh: Bukti transfer buram / nominal pembayaran tidak sesuai..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-md text-white text-sm focus:outline-none focus:ring-amber-400 focus:border-amber-400"
              />
            </div>

            <div className="pt-3 flex justify-end space-x-3">
              <button
                type="button"
                disabled={isDeciding}
                onClick={closeDecision}
                className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={
                  isDeciding ||
                  reasonLength === 0 ||
                  reasonLength > 255
                }
                className="px-4 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeciding ? 'Menolak...' : 'Konfirmasi Tolak'}
              </button>
            </div>
          </form>
        )}
      </DecisionDialog>
    </div>
  );
}