<?php

namespace Database\Factories;

use App\Models\MembershipPlan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<MembershipPlan>
 */
class MembershipPlanFactory extends Factory
{
    protected $model = MembershipPlan::class;

    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(2, true),
            'duration_days' => fake()->randomElement([30, 90, 180, 365]),
            'price' => fake()->randomFloat(2, 100000, 2000000),
            'description' => fake()->sentence(),
            'is_active' => true,
        ];
    }
}
