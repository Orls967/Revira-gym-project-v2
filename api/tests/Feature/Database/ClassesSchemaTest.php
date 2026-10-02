<?php

namespace Tests\Feature\Database;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use App\Models\OperationalHour;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ClassesSchemaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::getDriverName() === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        }
    }

    public function test_classes_tables_and_columns_exist(): void
    {
        $this->assertTrue(Schema::hasTable('instructors'));
        $this->assertTrue(Schema::hasTable('operational_hours'));
        $this->assertTrue(Schema::hasTable('classes'));
        $this->assertTrue(Schema::hasTable('class_schedules'));
        $this->assertTrue(Schema::hasTable('class_participants'));
        $this->assertTrue(Schema::hasTable('notification_logs'));

        $this->assertFalse(Schema::hasTable('notifications_log'));

        $this->assertTrue(Schema::hasTable('jobs'));
        $this->assertTrue(Schema::hasTable('job_batches'));
        $this->assertTrue(Schema::hasTable('failed_jobs'));

        $this->assertFalse(Schema::hasColumn('classes', 'max_participants'));

        $this->assertTrue(Schema::hasColumns('instructors', [
            'id', 'name', 'specialization', 'phone_number', 'is_active', 'created_at', 'updated_at',
        ]));

        $this->assertTrue(Schema::hasColumns('operational_hours', [
            'id', 'day_of_week', 'open_time', 'close_time', 'is_closed', 'created_at', 'updated_at',
        ]));

        $this->assertTrue(Schema::hasColumns('classes', [
            'id', 'name', 'description', 'min_participants', 'default_instructor_id', 'created_at', 'updated_at',
        ]));

        $this->assertTrue(Schema::hasColumns('class_schedules', [
            'id', 'class_id', 'instructor_id', 'schedule_date', 'start_time', 'end_time', 'status', 'cancel_reason', 'created_at', 'updated_at',
        ]));

        $this->assertTrue(Schema::hasColumns('class_participants', [
            'id', 'class_schedule_id', 'user_id', 'status', 'booked_at', 'created_at', 'updated_at',
        ]));

        $this->assertTrue(Schema::hasColumns('notification_logs', [
            'id', 'user_id', 'recipient_phone', 'type', 'message', 'sent_at', 'status',
        ]));
    }

    public function test_unique_constraint_on_operational_hours_day_of_week(): void
    {
        OperationalHour::create([
            'day_of_week' => 'Senin',
            'open_time' => '07:00:00',
            'close_time' => '21:00:00',
            'is_closed' => false,
        ]);

        $this->expectException(QueryException::class);

        OperationalHour::create([
            'day_of_week' => 'Senin',
            'open_time' => '08:00:00',
            'close_time' => '20:00:00',
            'is_closed' => false,
        ]);
    }

    public function test_unique_constraint_on_class_participants(): void
    {
        $user = User::factory()->create();
        $instructor = Instructor::create([
            'name' => 'Coach Budi',
            'specialization' => 'Yoga',
            'is_active' => true,
        ]);

        $class = GymClass::create([
            'name' => 'Yoga Morning',
            'min_participants' => 3,
            'default_instructor_id' => $instructor->id,
        ]);

        $schedule = ClassSchedule::create([
            'class_id' => $class->id,
            'instructor_id' => $instructor->id,
            'schedule_date' => now()->addDay()->toDateString(),
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => 'scheduled',
        ]);

        ClassParticipant::create([
            'class_schedule_id' => $schedule->id,
            'user_id' => $user->id,
            'status' => 'booked',
            'booked_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        ClassParticipant::create([
            'class_schedule_id' => $schedule->id,
            'user_id' => $user->id,
            'status' => 'booked',
            'booked_at' => now(),
        ]);
    }

    public function test_class_schedules_has_schedule_date_and_status_index(): void
    {
        $this->assertTrue(
            Schema::hasIndex('class_schedules', ['schedule_date', 'status'])
        );
    }
}
