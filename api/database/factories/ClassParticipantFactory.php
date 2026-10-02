<?php

namespace Database\Factories;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClassParticipant>
 */
class ClassParticipantFactory extends Factory
{
    protected $model = ClassParticipant::class;

    public function definition(): array
    {
        return [
            'class_schedule_id' => ClassSchedule::factory(),
            'user_id' => User::factory(),
            'status' => 'booked',
            'booked_at' => now(),
        ];
    }
}
