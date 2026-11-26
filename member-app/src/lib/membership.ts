// Penentuan jenis pengajuan untuk label di Beranda dan layar Apply.
// Jenis pengajuan sebenarnya tetap ditentukan backend; ini hanya untuk teks di UI.
//
// - none / tidak ada membership      -> pendaftaran pertama
// - active / expired                 -> perpanjangan (sudah punya riwayat membership)
// - selain itu (rejected, pending, dll) -> riwayat belum bisa dipastikan, pakai label netral

// Older API deployments only expose a pending membership when it wins the summary.
export function hasPendingApplication(profile?: {
  has_pending_application?: boolean;
  membership?: { status?: string | null } | null;
} | null): boolean {
  return profile?.has_pending_application ?? (profile?.membership?.status === 'pending');
}

export type MembershipAction = 'register' | 'renew' | 'apply';

interface MembershipLike {
  status?: string | null;
}

export function getMembershipAction(membership?: MembershipLike | null): MembershipAction {
  const status = membership?.status ?? 'none';
  if (status === 'none') return 'register';
  if (status === 'active' || status === 'expired' || status === 'upcoming') return 'renew';
  return 'apply';
}

// Label tombol (Beranda)
export const MEMBERSHIP_ACTION_LABEL: Record<MembershipAction, string> = {
  register: 'Daftar',
  renew: 'Perpanjang',
  apply: 'Ajukan Membership',
};

// Judul layar (Apply)
export const MEMBERSHIP_ACTION_TITLE: Record<MembershipAction, string> = {
  register: 'Pendaftaran Membership',
  renew: 'Perpanjang Membership',
  apply: 'Ajukan Membership',
};
export interface MembershipPlan {
  id: number;
  name: string;
  price: number;
  duration_days: number;
}
export function parseMembershipPlans(data: unknown): MembershipPlan[] {
  if (!Array.isArray(data)) throw new Error('Format paket tidak valid.');
  return data.filter(p => p && p.is_active !== false && Number.isInteger(p.id) && typeof p.name === 'string' && Number.isFinite(p.price) && p.price >= 0 && Number.isInteger(p.duration_days) && p.duration_days > 0);
}
