import { ClassSchedule } from "@/types/schedule";

// Extended mock interface so mock items carry exact backend fields (F4, F7, F8)
// while remaining 100% assignable to ClassSchedule[] (src/types/schedule.ts)
export interface MockScheduleItem extends Omit<ClassSchedule, "status"> {
  status: ClassSchedule["status"];
  class_name: string;
  instructor_name: string;
  schedule_date: string;
  participants_count: number;
  min_participants: number | null;
  backend_status?: "scheduled" | "cancelled" | "completed";
}

// Helper membuat tanggal offset dalam zona waktu WITA (UTC+08:00) (0 = Hari ini, 1 = Besok, dst)
const getWitaOffsetDateString = (daysAhead: number): string => {
  const now = new Date();
  const witaMs = now.getTime() + 8 * 60 * 60 * 1000;
  const witaDate = new Date(witaMs);
  witaDate.setUTCDate(witaDate.getUTCDate() + daysAhead);
  return witaDate.toISOString().split("T")[0];
};

const rawMocks: MockScheduleItem[] = [
  // --- HARI INI (H+0) ---
  {
    id: 101,
    title: "Morning Yoga & Mobility",
    class_name: "Morning Yoga & Mobility",
    instructor: "Siti Rahmawati",
    instructor_name: "Siti Rahmawati",
    date: getWitaOffsetDateString(0),
    schedule_date: getWitaOffsetDateString(0),
    start_time: "07:00",
    end_time: "08:15",
    status: "active",
    backend_status: "completed",
    current_participants: 8,
    participants_count: 8,
    min_participants: 5,
    max_participants: 0, // Backend tidak memakai max_participants (SCRUM-52)
  },
  {
    id: 102,
    title: "HIIT Cardio Blast",
    class_name: "HIIT Cardio Blast",
    instructor: "Budi Santoso",
    instructor_name: "Budi Santoso",
    date: getWitaOffsetDateString(0),
    schedule_date: getWitaOffsetDateString(0),
    start_time: "16:30",
    end_time: "17:30",
    status: "cancelled",
    backend_status: "cancelled",
    cancel_reason: "Instruktur berhalangan hadir (Sakit)",
    current_participants: 4,
    participants_count: 4,
    min_participants: 6,
    max_participants: 0,
  },
  {
    id: 103,
    title: "Power Bodybuilding",
    class_name: "Power Bodybuilding",
    instructor: "Reza Rahadian",
    instructor_name: "Reza Rahadian",
    date: getWitaOffsetDateString(0),
    schedule_date: getWitaOffsetDateString(0),
    start_time: "20:00",
    end_time: "21:30",
    status: "active",
    backend_status: "scheduled",
    current_participants: 12,
    participants_count: 12,
    min_participants: 5,
    max_participants: 0,
  },

  // --- BESOK (H+1) ---
  {
    id: 201,
    title: "Zumba Dance Fitness",
    class_name: "Zumba Dance Fitness",
    instructor: "Maya Indah",
    instructor_name: "Maya Indah",
    date: getWitaOffsetDateString(1),
    schedule_date: getWitaOffsetDateString(1),
    start_time: "16:00",
    end_time: "17:00",
    status: "active",
    backend_status: "scheduled",
    current_participants: 3,
    participants_count: 3,
    min_participants: 8, // Contoh kuota minimum belum terpenuhi
    max_participants: 0,
  },
  {
    id: 202,
    title: "Chest & Triceps Focus",
    class_name: "Chest & Triceps Focus",
    instructor: "Budi Santoso",
    instructor_name: "Budi Santoso",
    date: getWitaOffsetDateString(1),
    schedule_date: getWitaOffsetDateString(1),
    start_time: "18:30",
    end_time: "20:00",
    status: "active",
    backend_status: "scheduled",
    current_participants: 9,
    participants_count: 9,
    min_participants: 5,
    max_participants: 0,
  },

  // --- HARI KE-3 (H+2) ---
  {
    id: 301,
    title: "Pilates Core Reformer",
    class_name: "Pilates Core Reformer",
    instructor: "Siti Rahmawati",
    instructor_name: "Siti Rahmawati",
    date: getWitaOffsetDateString(2),
    schedule_date: getWitaOffsetDateString(2),
    start_time: "08:00",
    end_time: "09:15",
    status: "active",
    backend_status: "scheduled",
    current_participants: 6,
    participants_count: 6,
    min_participants: 4,
    max_participants: 0,
  },
  {
    id: 302,
    title: "Muay Thai Basic",
    class_name: "Muay Thai Basic",
    instructor: "Doni Pratama",
    instructor_name: "Doni Pratama",
    date: getWitaOffsetDateString(2),
    schedule_date: getWitaOffsetDateString(2),
    start_time: "17:00",
    end_time: "18:30",
    status: "cancelled",
    backend_status: "cancelled",
    cancel_reason: "Pemeliharaan area matras gym",
    current_participants: 5,
    participants_count: 5,
    min_participants: 5,
    max_participants: 0,
  },

  // --- HARI KE-4 (H+3) ---
  {
    id: 401,
    title: "Full Body Functional Training",
    class_name: "Full Body Functional Training",
    instructor: "Reza Rahadian",
    instructor_name: "Reza Rahadian",
    date: getWitaOffsetDateString(3),
    schedule_date: getWitaOffsetDateString(3),
    start_time: "16:30",
    end_time: "18:00",
    status: "active",
    backend_status: "scheduled",
    current_participants: 9,
    participants_count: 9,
    min_participants: 6,
    max_participants: 0,
  },

  // --- HARI KE-5 (H+4) ---
  {
    id: 501,
    title: "Spinning Indoor Cycling",
    class_name: "Spinning Indoor Cycling",
    instructor: "Maya Indah",
    instructor_name: "Maya Indah",
    date: getWitaOffsetDateString(4),
    schedule_date: getWitaOffsetDateString(4),
    start_time: "19:00",
    end_time: "20:00",
    status: "active",
    backend_status: "scheduled",
    current_participants: 2,
    participants_count: 2,
    min_participants: 5,
    max_participants: 0,
  },

  // --- HARI KE-6 (H+5) ---
  {
    id: 601,
    title: "Leg Day & Glutes Conditioning",
    class_name: "Leg Day & Glutes Conditioning",
    instructor: "Budi Santoso",
    instructor_name: "Budi Santoso",
    date: getWitaOffsetDateString(5),
    schedule_date: getWitaOffsetDateString(5),
    start_time: "09:00",
    end_time: "10:30",
    status: "active",
    backend_status: "scheduled",
    current_participants: 11,
    participants_count: 11,
    min_participants: 5,
    max_participants: 0,
  },

  // --- HARI KE-7 (H+6) ---
  {
    id: 701,
    title: "Sunday Recovery & Stretching",
    class_name: "Sunday Recovery & Stretching",
    instructor: "Siti Rahmawati",
    instructor_name: "Siti Rahmawati",
    date: getWitaOffsetDateString(6),
    schedule_date: getWitaOffsetDateString(6),
    start_time: "08:00",
    end_time: "09:30",
    status: "active",
    backend_status: "scheduled",
    current_participants: 4,
    participants_count: 4,
    min_participants: 0, // Contoh eksplisit min_participants = 0 (F8)
    max_participants: 0,
  },
];

export const MOCK_SCHEDULES: ClassSchedule[] = rawMocks;