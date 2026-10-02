<?php

namespace Database\Seeders;

use App\Models\GymClass;
use App\Models\Instructor;
use Illuminate\Database\Seeder;

class ClassSeeder extends Seeder
{
    public function run(): void
    {
        $budi = Instructor::where('name', 'Coach Budi Santoso')->first();
        $siti = Instructor::where('name', 'Coach Siti Rahma')->first();
        $agus = Instructor::where('name', 'Coach Agus Pratama')->first();

        $classes = [
            [
                'name' => 'Yoga Morning Flow',
                'description' => 'Sesi peregangan dan meditasi pagi untuk kelenturan dan ketenangan mental.',
                'min_participants' => 3,
                'default_instructor_id' => $agus->id,
                'is_active' => true,
            ],
            [
                'name' => 'Body Pump & Strength',
                'description' => 'Latihan beban dinamis dengan barbel untuk melatih kekuatan seluruh kelompok otot.',
                'min_participants' => 4,
                'default_instructor_id' => $budi->id,
                'is_active' => true,
            ],
            [
                'name' => 'Zumba Cardio Party',
                'description' => 'Kardio menyenangkan berbasis ritme musik latin untuk pembakaran kalori intensif.',
                'min_participants' => 5,
                'default_instructor_id' => $siti->id,
                'is_active' => true,
            ],
        ];

        foreach ($classes as $class) {
            GymClass::updateOrCreate(
                ['name' => $class['name']],
                $class
            );
        }
    }
}
