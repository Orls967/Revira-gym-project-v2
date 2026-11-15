import { ClassSchedule } from "@/types/schedule";

// Development fixtures follow the public API contract.
export type MockScheduleItem = ClassSchedule;

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
    class_name: "Morning Yoga & Mobility",
    instructor_name: "Siti Rahmawati",
    schedule_date: getWitaOffsetDateString(0),
    start_time: "07:00",
    end_time: "08:15",
    status: "completed",
    participants_count: 8,
    min_participants: 5,
  },
  {
    id: 102,
    class_name: "HIIT Cardio Blast",
    instructor_name: "Budi Santoso",
    schedule_date: getWitaOffsetDateString(0),
    start_time: "16:30",
    end_time: "17:30",
    status: "cancelled",
    cancel_reason: "Instruktur berhalangan hadir (Sakit)",
    participants_count: 4,
    min_participants: 6,
  },
  {
    id: 103,
    class_name: "Power Bodybuilding",
    instructor_name: "Reza Rahadian",
    schedule_date: getWitaOffsetDateString(0),
    start_time: "20:00",
    end_time: "21:30",
    status: "scheduled",
    participants_count: 12,
    min_participants: 5,
  },

  // --- BESOK (H+1) ---
  {
    id: 201,
    class_name: "Zumba Dance Fitness",
    instructor_name: "Maya Indah",
    schedule_date: getWitaOffsetDateString(1),
    start_time: "16:00",
    end_time: "17:00",
    status: "scheduled",
    participants_count: 3,
    min_participants: 8,
  },
  {
    id: 202,
    class_name: "Chest & Triceps Focus",
    instructor_name: "Budi Santoso",
    schedule_date: getWitaOffsetDateString(1),
    start_time: "18:30",
    end_time: "20:00",
    status: "scheduled",
    participants_count: 9,
    min_participants: 5,
  },

  // --- HARI KE-3 (H+2) ---
  {
    id: 301,
    class_name: "Pilates Core Reformer",
    instructor_name: "Siti Rahmawati",
    schedule_date: getWitaOffsetDateString(2),
    start_time: "08:00",
    end_time: "09:15",
    status: "scheduled",
    participants_count: 6,
    min_participants: 4,
  },
  {
    id: 302,
    class_name: "Muay Thai Basic",
    instructor_name: "Doni Pratama",
    schedule_date: getWitaOffsetDateString(2),
    start_time: "17:00",
    end_time: "18:30",
    status: "cancelled",
    cancel_reason: "Pemeliharaan area matras gym",
    participants_count: 5,
    min_participants: 5,
  },

  // --- HARI KE-4 (H+3) ---
  {
    id: 401,
    class_name: "Full Body Functional Training",
    instructor_name: "Reza Rahadian",
    schedule_date: getWitaOffsetDateString(3),
    start_time: "16:30",
    end_time: "18:00",
    status: "scheduled",
    participants_count: 9,
    min_participants: 6,
  },

  // --- HARI KE-5 (H+4) ---
  {
    id: 501,
    class_name: "Spinning Indoor Cycling",
    instructor_name: "Maya Indah",
    schedule_date: getWitaOffsetDateString(4),
    start_time: "19:00",
    end_time: "20:00",
    status: "scheduled",
    participants_count: 2,
    min_participants: 5,
  },

  // --- HARI KE-6 (H+5) ---
  {
    id: 601,
    class_name: "Leg Day & Glutes Conditioning",
    instructor_name: "Budi Santoso",
    schedule_date: getWitaOffsetDateString(5),
    start_time: "09:00",
    end_time: "10:30",
    status: "scheduled",
    participants_count: 11,
    min_participants: 5,
  },

  // --- HARI KE-7 (H+6) ---
  {
    id: 701,
    class_name: "Sunday Recovery & Stretching",
    instructor_name: "Siti Rahmawati",
    schedule_date: getWitaOffsetDateString(6),
    start_time: "08:00",
    end_time: "09:30",
    status: "scheduled",
    participants_count: 4,
    min_participants: 0,
  },
];

export const MOCK_SCHEDULES: ClassSchedule[] = rawMocks;