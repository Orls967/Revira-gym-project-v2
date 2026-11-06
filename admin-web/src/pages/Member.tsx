import { useState, useEffect, useCallback } from 'react';
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
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  
  // State UI
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State Filter & Pagination
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebounce(search, 500); // Delay 500ms
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pagination, setPagination] = useState<PaginationData | null>(null);

  // 1. Ambil daftar paket untuk dropdown filter (SCRUM-93)
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await api.get('/api/v1/admin/membership-plans');
        setPlans(res.data?.data || []);
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
      const res = await api.get('/api/v1/admin/members', {
        params: {
          search: debouncedSearch,
          status: statusFilter,
          plan_id: planFilter,
          page: page,
        },
      });
      
      const data = res.data?.data || res.data;
      
      if (data.data && typeof data.current_page !== 'undefined') {
        setMembers(data.data);
        setPagination({
          current_page: data.current_page,
          last_page: data.last_page,
          total: data.total,
        });
      } else {
        setMembers(Array.isArray(data) ? data : []);
        setPagination(null);
      }
    } catch (error) {
      // Bypass peringatan 'any' dengan mendeklarasikan tipe struktur error
      const err = error as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || 'Gagal memuat data member. Silakan coba lagi.');
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
    if (!status) return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Tidak Aktif</span>;
    
    switch (status.toLowerCase()) {
      case 'active':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Aktif</span>;
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Menunggu Verifikasi</span>;
      case 'expired':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Kedaluwarsa</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium capitalize">{status}</span>;
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manajemen Member</h1>
      </div>

      {/* Area Filter & Pencarian */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Cari nama atau email..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // Set state page di dalam event handler (mencegah error set-state-in-effect)
            }}
          />
        </div>
        <select
          className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
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
          className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
            <p className="text-gray-500 font-medium">Memuat data member...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="text-red-500 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-800 font-medium mb-4">{error}</p>
            <button
              onClick={fetchMembers}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="text-gray-400 mb-2">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium text-lg">Tidak ada data member</p>
            <p className="text-gray-400 text-sm mt-1">Coba sesuaikan filter atau kata kunci pencarian Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Nama</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Kontak</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Paket</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-700">Periode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-800">{member.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-800">{member.email}</p>
                      <p className="text-xs text-gray-500 mt-1">{member.phone || '-'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {member.membership?.plan_name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(member.membership?.status)}
                    </td>
                    <td className="px-6 py-4">
                      {member.membership ? (
                        <div className="text-sm text-gray-700">
                          <p>{formatDate(member.membership.start_date)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">s/d {formatDate(member.membership.end_date)}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
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
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-600">
              Menampilkan Halaman <span className="font-semibold">{pagination.current_page}</span> dari <span className="font-semibold">{pagination.last_page}</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.current_page === 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                disabled={pagination.current_page === pagination.last_page}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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