<?php

namespace Database\Factories;

use App\Models\GymClass;
use App\Models\Instructor;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GymClass>
 */
class GymClassFactory extends Factory
{
    protected $model = GymClass::class;

    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(2, true).' Class',
            'description' => fake()->sentence(),
            'min_participants' => fake()->numberBetween(3, 8),
            'default_instructor_id' => Instructor::factory(),
        ];
    }
}
