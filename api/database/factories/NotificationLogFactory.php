<?php

namespace Database\Factories;

use App\Models\NotificationLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<NotificationLog>
 */
class NotificationLogFactory extends Factory
{
    protected $model = NotificationLog::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => fake()->randomElement(['new_registration', 'expiry_reminder', 'class_cancelled']),
            'message' => fake()->sentence(),
            'sent_at' => now(),
            'status' => 'sent',
        ];
    }
}
