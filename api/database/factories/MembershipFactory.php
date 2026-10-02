<?php

namespace Database\Factories;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Membership>
 */
class MembershipFactory extends Factory
{
    protected $model = Membership::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'membership_plan_id' => MembershipPlan::factory(),
            'record_type' => fake()->randomElement(['registration', 'extension']),
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(30)->toDateString(),
            'status' => 'active',
        ];
    }

    public function pending(): static
    {
        return $this->state(fn () => [
            'start_date' => null,
            'end_date' => null,
            'status' => 'pending',
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn () => [
            'start_date' => now()->subDays(60)->toDateString(),
            'end_date' => now()->subDays(30)->toDateString(),
            'status' => 'expired',
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => [
            'start_date' => null,
            'end_date' => null,
            'status' => 'rejected',
        ]);
    }
}
