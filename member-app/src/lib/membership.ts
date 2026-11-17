// Penentuan jenis pengajuan untuk label di Beranda dan layar Apply.
// Jenis pengajuan sebenarnya tetap ditentukan backend; ini hanya untuk teks di UI.
//
// - none / tidak ada membership      -> pendaftaran pertama
// - active / expired                 -> perpanjangan (sudah punya riwayat membership)
// - selain itu (rejected, pending, dll) -> riwayat belum bisa dipastikan, pakai label netral

export type MembershipAction = 'register' | 'renew' | 'apply';

interface MembershipLike {
  status?: string | null;
}

export function getMembershipAction(membership?: MembershipLike | null): MembershipAction {
  const status = membership?.status ?? 'none';
  if (status === 'none') return 'register';
  if (status === 'active' || status === 'expired') return 'renew';
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