<?php

namespace Database\Seeders;

use App\Models\Instructor;
use Illuminate\Database\Seeder;

class InstructorSeeder extends Seeder
{
    public function run(): void
    {
        $instructors = [
            [
                'name' => 'Coach Budi Santoso',
                'specialization' => 'Bodybuilding & Strength Training',
                'phone_number' => '081398765431',
                'is_active' => true,
            ],
            [
                'name' => 'Coach Siti Rahma',
                'specialization' => 'Zumba & Aerobics',
                'phone_number' => '081398765432',
                'is_active' => true,
            ],
            [
                'name' => 'Coach Agus Pratama',
                'specialization' => 'Yoga & Flexibility',
                'phone_number' => '081398765433',
                'is_active' => true,
            ],
        ];

        foreach ($instructors as $instructor) {
            Instructor::updateOrCreate(
                ['name' => $instructor['name']],
                $instructor
            );
        }
    }
}
