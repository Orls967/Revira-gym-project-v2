<?php

namespace Database\Factories;

use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClassSchedule>
 */
class ClassScheduleFactory extends Factory
{
    protected $model = ClassSchedule::class;

    public function definition(): array
    {
        return [
            'class_id' => GymClass::factory(),
            'instructor_id' => fn (array $attributes) => GymClass::find($attributes['class_id'])?->default_instructor_id ?? Instructor::factory(),
            'schedule_date' => now()->addDays(fake()->numberBetween(1, 7))->toDateString(),
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => 'scheduled',
            'cancel_reason' => null,
        ];
    }
}
