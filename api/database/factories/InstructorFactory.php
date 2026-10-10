<?php

namespace Database\Factories;

use App\Models\Instructor;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Instructor>
 */
class InstructorFactory extends Factory
{
    protected $model = Instructor::class;

    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'specialization' => fake()->randomElement(['Fitness', 'Yoga', 'Zumba', 'Pilates', 'Bodybuilding']),
            'phone_number' => '08'.fake()->numerify('##########'),
            'is_active' => true,
        ];
    }
}
