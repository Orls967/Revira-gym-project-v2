import { ClassSchedule } from "@/types/schedule";

// Helper membuat tanggal offset (0 = Hari ini, 1 = Besok, dst)
const getOffsetDateString = (daysAhead: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
};

export const MOCK_SCHEDULES: ClassSchedule[] = [
  // --- HARI INI (H+0) ---
  {
    id: 101,
    title: "Morning Yoga & Mobility",
    instructor: "Siti Rahmawati",
    date: getOffsetDateString(0),
    start_time: "07:00",
    end_time: "08:15",
    status: "active",
    current_participants: 8,
    max_participants: 15,
  },
  {
    id: 102,
    title: "HIIT Cardio Blast",
    instructor: "Budi Santoso",
    date: getOffsetDateString(0),
    start_time: "16:30",
    end_time: "17:30",
    status: "cancelled",
    cancel_reason: "Instruktur berhalangan hadir (Sakit)",
    current_participants: 12,
    max_participants: 20,
  },
  {
    id: 103,
    title: "Power Bodybuilding",
    instructor: "Reza Rahadian",
    date: getOffsetDateString(0),
    start_time: "19:00",
    end_time: "20:30",
    status: "active",
    current_participants: 20,
    max_participants: 20,
  },

  // --- BESOK (H+1) ---
  {
    id: 201,
    title: "Zumba Dance Fitness",
    instructor: "Maya Indah",
    date: getOffsetDateString(1),
    start_time: "16:00",
    end_time: "17:00",
    status: "active",
    current_participants: 10,
    max_participants: 25,
  },
  {
    id: 202,
    title: "Chest & Triceps Focus",
    instructor: "Budi Santoso",
    date: getOffsetDateString(1),
    start_time: "18:30",
    end_time: "20:00",
    status: "active",
    current_participants: 14,
    max_participants: 15,
  },

  // --- HARI KE-3 (H+2) ---
  {
    id: 301,
    title: "Pilates Core Reformer",
    instructor: "Siti Rahmawati",
    date: getOffsetDateString(2),
    start_time: "08:00",
    end_time: "09:15",
    status: "active",
    current_participants: 6,
    max_participants: 12,
  },
  {
    id: 302,
    title: "Muay Thai Basic",
    instructor: "Doni Pratama",
    date: getOffsetDateString(2),
    start_time: "17:00",
    end_time: "18:30",
    status: "cancelled",
    cancel_reason: "Pemeliharaan area matras gym",
    current_participants: 5,
    max_participants: 15,
  },

  // --- HARI KE-4 (H+3) ---
  {
    id: 401,
    title: "Full Body Functional Training",
    instructor: "Reza Rahadian",
    date: getOffsetDateString(3),
    start_time: "16:30",
    end_time: "18:00",
    status: "active",
    current_participants: 9,
    max_participants: 18,
  },

  // --- HARI KE-5 (H+4) ---
  {
    id: 501,
    title: "Spinning Indoor Cycling",
    instructor: "Maya Indah",
    date: getOffsetDateString(4),
    start_time: "19:00",
    end_time: "20:00",
    status: "active",
    current_participants: 15,
    max_participants: 15,
  },

  // --- HARI KE-6 (H+5) ---
  {
    id: 601,
    title: "Leg Day & Glutes Conditioning",
    instructor: "Budi Santoso",
    date: getOffsetDateString(5),
    start_time: "09:00",
    end_time: "10:30",
    status: "active",
    current_participants: 11,
    max_participants: 20,
  },

  // --- HARI KE-7 (H+6) ---
  {
    id: 701,
    title: "Sunday Recovery & Stretching",
    instructor: "Siti Rahmawati",
    date: getOffsetDateString(6),
    start_time: "08:00",
    end_time: "09:30",
    status: "active",
    current_participants: 4,
    max_participants: 15,
  },
];