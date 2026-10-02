<?php

namespace Database\Seeders;

use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use Illuminate\Database\Seeder;

class ClassScheduleSeeder extends Seeder
{
    public function run(): void
    {
        $yoga = GymClass::where('name', 'Yoga Morning Flow')->first();
        $pump = GymClass::where('name', 'Body Pump & Strength')->first();
        $zumba = GymClass::where('name', 'Zumba Cardio Party')->first();

        $budi = Instructor::where('name', 'Coach Budi Santoso')->first();
        $siti = Instructor::where('name', 'Coach Siti Rahma')->first();
        $agus = Instructor::where('name', 'Coach Agus Pratama')->first();

        $today = now('Asia/Makassar')->startOfDay();

        $schedules = [
            // Sesi 1 (Hari 1): Yoga (min 3) -> scheduled (akan diisi >= 3 peserta)
            [
                'class_id' => $yoga->id,
                'instructor_id' => $agus->id,
                'schedule_date' => $today->copy()->addDays(1)->toDateString(),
                'start_time' => '07:30:00',
                'end_time' => '08:30:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
            ],
            // Sesi 2 (Hari 2): Zumba (min 5) -> scheduled (akan diisi 1 peserta, di bawah minimum)
            [
                'class_id' => $zumba->id,
                'instructor_id' => $siti->id,
                'schedule_date' => $today->copy()->addDays(2)->toDateString(),
                'start_time' => '16:30:00',
                'end_time' => '17:30:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
            ],
            // Sesi 3 (Hari 3): Body Pump -> scheduled
            [
                'class_id' => $pump->id,
                'instructor_id' => $budi->id,
                'schedule_date' => $today->copy()->addDays(3)->toDateString(),
                'start_time' => '19:00:00',
                'end_time' => '20:00:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
            ],
            // Sesi 4 (Hari 4): Yoga -> scheduled
            [
                'class_id' => $yoga->id,
                'instructor_id' => $agus->id,
                'schedule_date' => $today->copy()->addDays(4)->toDateString(),
                'start_time' => '07:30:00',
                'end_time' => '08:30:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
            ],
            // Sesi 5 (Hari 5): Body Pump -> scheduled
            [
                'class_id' => $pump->id,
                'instructor_id' => $budi->id,
                'schedule_date' => $today->copy()->addDays(5)->toDateString(),
                'start_time' => '19:00:00',
                'end_time' => '20:00:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
            ],
            // Sesi 6 (Hari 6): Zumba -> CANCELLED (dengan cancel_reason)
            [
                'class_id' => $zumba->id,
                'instructor_id' => $siti->id,
                'schedule_date' => $today->copy()->addDays(6)->toDateString(),
                'start_time' => '16:30:00',
                'end_time' => '17:30:00',
                'status' => 'cancelled',
                'cancel_reason' => 'Instruktur berhalangan hadir karena keperluan mendesak.',
            ],
            // Sesi 7 (Hari 7): Yoga -> scheduled
            [
                'class_id' => $yoga->id,
                'instructor_id' => $agus->id,
                'schedule_date' => $today->copy()->addDays(7)->toDateString(),
                'start_time' => '08:00:00',
                'end_time' => '09:00:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
            ],
        ];

        foreach ($schedules as $schedule) {
            $existing = ClassSchedule::where('class_id', $schedule['class_id'])
                ->whereDate('schedule_date', $schedule['schedule_date'])
                ->where('start_time', $schedule['start_time'])
                ->first();

            if ($existing) {
                $existing->update($schedule);
            } else {
                ClassSchedule::create($schedule);
            }
        }
    }
}
