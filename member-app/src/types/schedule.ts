export interface ClassSchedule {
  id: number;
  title: string;
  instructor: string;
  date: string; // Format: YYYY-MM-DD
  start_time: string; // HH:mm (WITA)
  end_time: string; // HH:mm (WITA)
  status: "active" | "cancelled";
  cancel_reason?: string;
  current_participants: number;
  max_participants: number;
}

export interface ScheduleSection {
  title: string; // Contoh: "Hari Ini • Sabtu, 10 Okt"
  date: string; // YYYY-MM-DD
  data: ClassSchedule[];
}