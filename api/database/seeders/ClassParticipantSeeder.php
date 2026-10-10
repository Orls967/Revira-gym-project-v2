<?php

namespace Database\Seeders;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\User;
use Illuminate\Database\Seeder;

class ClassParticipantSeeder extends Seeder
{
    public function run(): void
    {
        $yoga = GymClass::where('name', 'Yoga Morning Flow')->first();
        $zumba = GymClass::where('name', 'Zumba Cardio Party')->first();

        $member1 = User::where('email', 'member1@revira.test')->first();
        $member4 = User::where('email', 'member4@revira.test')->first();
        $member5 = User::where('email', 'member5@revira.test')->first();

        $today = now('Asia/Makassar')->startOfDay()->toDateString();

        // Cari sesi Yoga pertama (jadwal >= hari ini)
        $yogaSchedule = ClassSchedule::where('class_id', $yoga?->id)
            ->where('status', 'scheduled')
            ->whereDate('schedule_date', '>=', $today)
            ->orderBy('schedule_date')
            ->first();

        // Cari sesi Zumba pertama (jadwal >= hari ini)
        $zumbaSchedule = ClassSchedule::where('class_id', $zumba?->id)
            ->where('status', 'scheduled')
            ->whereDate('schedule_date', '>=', $today)
            ->orderBy('schedule_date')
            ->first();

        // Sesi 1 (Yoga): min 3 peserta -> daftarkan 3 member aktif (member1, member4, member5) -> memenuhi batas
        if ($yogaSchedule && $member1 && $member4 && $member5) {
            foreach ([$member1, $member4, $member5] as $member) {
                ClassParticipant::updateOrCreate(
                    [
                        'class_schedule_id' => $yogaSchedule->id,
                        'user_id' => $member->id,
                    ],
                    [
                        'status' => 'booked',
                        'booked_at' => now(),
                    ]
                );
            }
        }

        // Sesi 2 (Zumba): min 5 peserta -> daftarkan 1 member aktif (member1) -> di bawah minimum
        if ($zumbaSchedule && $member1) {
            ClassParticipant::updateOrCreate(
                [
                    'class_schedule_id' => $zumbaSchedule->id,
                    'user_id' => $member1->id,
                ],
                [
                    'status' => 'booked',
                    'booked_at' => now(),
                ]
            );
        }
    }
}
