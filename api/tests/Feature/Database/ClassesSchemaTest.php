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
            'id', 'name', 'description', 'min_participants', 'default_instructor_id', 'is_active', 'created_at', 'updated_at',
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

    public function test_classes_table_has_database_level_default_is_active(): void
    {
        $classId = DB::table('classes')->insertGetId([
            'name' => 'Yoga DB Default',
            'min_participants' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $class = DB::table('classes')->where('id', $classId)->first();
        $this->assertNotNull($class);
        $this->assertTrue((bool) $class->is_active);
    }

    public function test_classes_model_has_default_is_active(): void
    {
        $class = GymClass::create([
            'name' => 'Yoga Model Default',
            'min_participants' => 3,
        ]);

        $this->assertTrue($class->is_active);
        $this->assertArrayHasKey('is_active', $class->toArray());
        $this->assertTrue($class->toArray()['is_active']);
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

    public function test_restrict_on_delete_instructors_to_classes(): void
    {
        $instructorId = DB::table('instructors')->insertGetId([
            'name' => 'Coach Restrict 1',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('classes')->insertGetId([
            'name' => 'Class with default instructor',
            'min_participants' => 3,
            'default_instructor_id' => $instructorId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $failed = false;
        try {
            DB::table('instructors')->where('id', $instructorId)->delete();
        } catch (QueryException $e) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Deleting instructor should fail due to restrictOnDelete on classes.');
        $this->assertTrue(DB::table('instructors')->where('id', $instructorId)->exists());
    }

    public function test_restrict_on_delete_instructors_to_class_schedules(): void
    {
        $instructorId = DB::table('instructors')->insertGetId([
            'name' => 'Coach Restrict 2',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $classId = DB::table('classes')->insertGetId([
            'name' => 'Class without instructor',
            'min_participants' => 3,
            'default_instructor_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('class_schedules')->insertGetId([
            'class_id' => $classId,
            'instructor_id' => $instructorId,
            'schedule_date' => now()->toDateString(),
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => 'scheduled',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $failed = false;
        try {
            DB::table('instructors')->where('id', $instructorId)->delete();
        } catch (QueryException $e) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Deleting instructor should fail due to restrictOnDelete on class_schedules.');
        $this->assertTrue(DB::table('instructors')->where('id', $instructorId)->exists());
    }

    public function test_restrict_on_delete_classes_to_class_schedules(): void
    {
        $instructorId = DB::table('instructors')->insertGetId([
            'name' => 'Coach Restrict 3',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $classId = DB::table('classes')->insertGetId([
            'name' => 'Class Restrict 3',
            'min_participants' => 3,
            'default_instructor_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('class_schedules')->insertGetId([
            'class_id' => $classId,
            'instructor_id' => $instructorId,
            'schedule_date' => now()->toDateString(),
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => 'scheduled',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $failed = false;
        try {
            DB::table('classes')->where('id', $classId)->delete();
        } catch (QueryException $e) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Deleting class should fail due to restrictOnDelete on class_schedules.');
        $this->assertTrue(DB::table('classes')->where('id', $classId)->exists());
    }

    public function test_restrict_on_delete_class_schedules_to_class_participants(): void
    {
        $instructorId = DB::table('instructors')->insertGetId([
            'name' => 'Coach Restrict 4',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $classId = DB::table('classes')->insertGetId([
            'name' => 'Class Restrict 4',
            'min_participants' => 3,
            'default_instructor_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $scheduleId = DB::table('class_schedules')->insertGetId([
            'class_id' => $classId,
            'instructor_id' => $instructorId,
            'schedule_date' => now()->toDateString(),
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => 'scheduled',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $userId = DB::table('users')->insertGetId([
            'name' => 'User Restrict 4',
            'email' => 'user_restrict4@revira.test',
            'password' => 'secret',
            'role' => 'member',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('class_participants')->insertGetId([
            'class_schedule_id' => $scheduleId,
            'user_id' => $userId,
            'status' => 'booked',
            'booked_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $failed = false;
        try {
            DB::table('class_schedules')->where('id', $scheduleId)->delete();
        } catch (QueryException $e) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Deleting class_schedule should fail due to restrictOnDelete on class_participants.');
        $this->assertTrue(DB::table('class_schedules')->where('id', $scheduleId)->exists());
    }

    public function test_restrict_on_delete_users_to_class_participants(): void
    {
        $instructorId = DB::table('instructors')->insertGetId([
            'name' => 'Coach Restrict 5',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $classId = DB::table('classes')->insertGetId([
            'name' => 'Class Restrict 5',
            'min_participants' => 3,
            'default_instructor_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $scheduleId = DB::table('class_schedules')->insertGetId([
            'class_id' => $classId,
            'instructor_id' => $instructorId,
            'schedule_date' => now()->toDateString(),
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => 'scheduled',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $userId = DB::table('users')->insertGetId([
            'name' => 'User Restrict 5',
            'email' => 'user_restrict5@revira.test',
            'password' => 'secret',
            'role' => 'member',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('class_participants')->insertGetId([
            'class_schedule_id' => $scheduleId,
            'user_id' => $userId,
            'status' => 'booked',
            'booked_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $failed = false;
        try {
            DB::table('users')->where('id', $userId)->delete();
        } catch (QueryException $e) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Deleting user should fail due to restrictOnDelete on class_participants.');
        $this->assertTrue(DB::table('users')->where('id', $userId)->exists());
    }

    public function test_restrict_on_delete_users_to_notification_logs(): void
    {
        $userId = DB::table('users')->insertGetId([
            'name' => 'User Restrict 6',
            'email' => 'user_restrict6@revira.test',
            'password' => 'secret',
            'role' => 'member',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('notification_logs')->insertGetId([
            'user_id' => $userId,
            'type' => 'new_registration',
            'message' => 'Test Notification',
            'sent_at' => now(),
            'status' => 'sent',
        ]);

        $failed = false;
        try {
            DB::table('users')->where('id', $userId)->delete();
        } catch (QueryException $e) {
            $failed = true;
        }

        $this->assertTrue($failed, 'Deleting user should fail due to restrictOnDelete on notification_logs.');
        $this->assertTrue(DB::table('users')->where('id', $userId)->exists());
    }

    public function test_parent_without_children_can_be_deleted(): void
    {
        $instructorId = DB::table('instructors')->insertGetId([
            'name' => 'Coach Free',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertSame(1, DB::table('instructors')->where('id', $instructorId)->delete());
        $this->assertFalse(DB::table('instructors')->where('id', $instructorId)->exists());

        $classId = DB::table('classes')->insertGetId([
            'name' => 'Class Free',
            'min_participants' => 3,
            'default_instructor_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertSame(1, DB::table('classes')->where('id', $classId)->delete());
        $this->assertFalse(DB::table('classes')->where('id', $classId)->exists());

        $userId = DB::table('users')->insertGetId([
            'name' => 'User Free',
            'email' => 'user_free@revira.test',
            'password' => 'secret',
            'role' => 'member',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->assertSame(1, DB::table('users')->where('id', $userId)->delete());
        $this->assertFalse(DB::table('users')->where('id', $userId)->exists());
    }
}
