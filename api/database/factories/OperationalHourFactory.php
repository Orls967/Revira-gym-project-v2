<?php

namespace Database\Factories;

use App\Models\OperationalHour;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OperationalHour>
 */
class OperationalHourFactory extends Factory
{
    protected $model = OperationalHour::class;

    public function definition(): array
    {
        return [
            'day_of_week' => fake()->unique()->randomElement(['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']),
            'open_time' => '07:00:00',
            'close_time' => '21:00:00',
            'is_closed' => false,
        ];
    }
}
