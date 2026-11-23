// PublicClassScheduleResource contract (Sprint 3 has no maximum capacity).
export type BackendScheduleStatus = "scheduled" | "ongoing" | "completed" | "cancelled";

export interface ClassSchedule {
  id: number;
  class_name: string;
  instructor_name: string;
  schedule_date: string; // YYYY-MM-DD (WITA)
  start_time: string; // HH:mm or HH:mm:ss (WITA)
  end_time: string;
  status: BackendScheduleStatus;
  cancel_reason?: string | null;
  participants_count: number;
  min_participants: number | null;
  updated_at?: string | null;
}

export interface ScheduleSection {
  title: string;
  date: string;
  data: ClassSchedule[];
}
