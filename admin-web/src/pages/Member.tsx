import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

// --- TIPE DATA ---
interface MembershipPlan {
  id: number;
  name: string;
}

interface Member {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  membership: {
    plan_name: string;
    status: string;
    start_date: string;
    end_date: string;
  } | null;
}

interface PaginationData {
  current_page: number;
  last_page: number;
  total: number;
}

// --- CUSTOM HOOK UNTUK DEBOUNCE ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function MemberPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  
  // State UI
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State Filter & Pagination
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pagination, setPagination] = useState<PaginationData | null>(null);

  // 1. Ambil daftar paket untuk dropdown filter
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await api.get('/api/v1/membership-plans');
        // Handle double 'data' wrapping commonly found in Laravel resources
        const plansData = res.data?.data?.data || res.data?.data || res.data || [];
        setPlans(Array.isArray(plansData) ? plansData : []);
      } catch (err) {
        console.error('Gagal memuat data paket untuk filter', err);
      }
    };
    fetchPlans();
  }, []);

  // 2. Ambil data member berdasarkan filter & paginasi
  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // PERBAIKAN: Menyesuaikan endpoint API yang benar
      const res = await api.get('/api/v1/memberships', {
        params: {
          search: debouncedSearch,
          status: statusFilter,
          plan_id: planFilter,
          page: page,
        },
      });
      
      // PERBAIKAN: Menangkap response API dengan lebih tangguh
      const rawData = res.data;
      
      if (rawData?.data && typeof rawData.current_page !== 'undefined') {
        // Format Pagination standar Laravel
        setMembers(rawData.data);
        setPagination({
          current_page: rawData.current_page,
          last_page: rawData.last_page,
          total: rawData.total,
        });
      } else if (rawData?.data?.data && typeof rawData.data.current_page !== 'undefined') {
        // Format Pagination jika dibungkus extra 'data'
        setMembers(rawData.data.data);
        setPagination({
          current_page: rawData.data.current_page,
          last_page: rawData.data.last_page,
          total: rawData.data.total,
        });
      } else {
        // Format Data Array biasa (tanpa paginasi)
        const arrayData = rawData?.data || rawData || [];
        setMembers(Array.isArray(arrayData) ? arrayData : []);
        setPagination(null);
      }
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || 'Gagal memuat data member. Silakan periksa koneksi DB.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, planFilter, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMembers();
  }, [fetchMembers]);

  // --- HELPER UNTUK UI ---
  const getStatusBadge = (status?: string) => {
    if (!status) return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium border border-gray-200">Tidak Aktif</span>;
    
    switch (status.toLowerCase()) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-200">Aktif</span>;
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium border border-yellow-200">Menunggu Verifikasi</span>;
      case 'expired':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium border border-red-200">Kedaluwarsa</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium capitalize border border-gray-200">{status}</span>;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header dengan Tombol Tambah (PERBAIKAN) */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manajemen Member</h1>
        <button
          onClick={() => navigate('/member/tambah')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Tambah Member
        </button>
      </div>

      {/* Area Filter & Pencarian */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Cari nama atau email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-700 bg-white"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="pending">Menunggu Verifikasi</option>
          <option value="expired">Kedaluwarsa</option>
        </select>
        <select
          className="px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-gray-700 bg-white"
          value={planFilter}
          onChange={(e) => {
            setPlanFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua Paket</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </div>

      {/* Area Konten (Loading, Error, Data) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium">Memuat data member...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="text-red-500 mb-3 bg-red-50 p-3 rounded-full">
              <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-gray-800 font-semibold mb-1">Terjadi Kesalahan</p>
            <p className="text-gray-500 mb-5 text-sm max-w-md mx-auto">{error}</p>
            <button
              onClick={fetchMembers}
              className="px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors text-sm"
            >
              Coba Muat Ulang
            </button>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="text-gray-400 mb-4 bg-gray-50 p-4 rounded-full">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-gray-800 font-semibold text-lg mb-1">Tidak ada data member ditemukan</p>
            <p className="text-gray-500 text-sm max-w-sm">Coba sesuaikan filter atau kata kunci pencarian Anda untuk melihat hasil lain.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nama & Kontak</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Paket</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Periode Aktif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900 mb-0.5 group-hover:text-blue-600 transition-colors">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{member.phone || 'Tidak ada nomor HP'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800">
                        {member.membership?.plan_name || 'Tidak ada paket'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(member.membership?.status)}
                    </td>
                    <td className="px-6 py-4">
                      {member.membership ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="w-8 text-xs font-semibold text-gray-400 uppercase">Dari</span>
                            <span className="font-medium">{formatDate(member.membership.start_date)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="w-8 text-xs font-semibold text-gray-400 uppercase">S/D</span>
                            <span className="font-medium">{formatDate(member.membership.end_date)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Belum berlangganan</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginasi (Muncul jika didukung oleh API Backend) */}
        {pagination && pagination.last_page > 1 && !loading && members.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50/50">
            <span className="text-sm text-gray-600 font-medium">
              Halaman <span className="text-gray-900">{pagination.current_page}</span> dari <span className="text-gray-900">{pagination.last_page}</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.current_page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                disabled={pagination.current_page === pagination.last_page}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}