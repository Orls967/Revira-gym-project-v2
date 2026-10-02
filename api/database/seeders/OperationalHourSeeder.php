<?php

namespace Database\Seeders;

use App\Models\OperationalHour;
use Illuminate\Database\Seeder;

class OperationalHourSeeder extends Seeder
{
    public function run(): void
    {
        $days = [
            ['day_of_week' => 'Senin', 'open_time' => '07:00:00', 'close_time' => '21:00:00', 'is_closed' => false],
            ['day_of_week' => 'Selasa', 'open_time' => '07:00:00', 'close_time' => '21:00:00', 'is_closed' => false],
            ['day_of_week' => 'Rabu', 'open_time' => '07:00:00', 'close_time' => '21:00:00', 'is_closed' => false],
            ['day_of_week' => 'Kamis', 'open_time' => '07:00:00', 'close_time' => '21:00:00', 'is_closed' => false],
            ['day_of_week' => 'Jumat', 'open_time' => '07:00:00', 'close_time' => '21:00:00', 'is_closed' => false],
            ['day_of_week' => 'Sabtu', 'open_time' => '07:00:00', 'close_time' => '21:00:00', 'is_closed' => false],
            ['day_of_week' => 'Minggu', 'open_time' => null, 'close_time' => null, 'is_closed' => true],
        ];

        foreach ($days as $day) {
            OperationalHour::updateOrCreate(
                ['day_of_week' => $day['day_of_week']],
                $day
            );
        }
    }
}
