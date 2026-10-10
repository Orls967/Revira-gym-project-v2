export interface MembershipPlan {
  id: number;
  name: string;
  price: number;
  duration_in_days: number;
  is_active: boolean;
}

export interface OperationalHour {
  day: string;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export const MOCK_PLANS: MembershipPlan[] = [
  { id: 1, name: 'Single Pass / Harian', price: 25000, duration_in_days: 1, is_active: true },
  { id: 2, name: 'Member Bulanan', price: 200000, duration_in_days: 30, is_active: true },
  { id: 3, name: 'Member 3 Bulan', price: 550000, duration_in_days: 90, is_active: true },
];

export const MOCK_HOURS: OperationalHour[] = [
  { day: 'Senin - Jumat', open_time: '07:00', close_time: '21:00', is_closed: false },
  { day: 'Sabtu', open_time: '07:00', close_time: '18:00', is_closed: false },
  { day: 'Minggu / Hari Libur', open_time: null, close_time: null, is_closed: true },
];