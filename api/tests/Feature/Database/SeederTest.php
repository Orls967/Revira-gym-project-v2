<?php

namespace Tests\Feature\Database;

use App\Enums\UserRole;
use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\OperationalHour;
use App\Models\Transaction;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class SeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_creates_expected_accounts_and_roles(): void
    {
        $this->seed();

        $admin = User::where('email', 'admin@revira.test')->first();
        $this->assertNotNull($admin);
        $this->assertSame(UserRole::Admin, $admin->role);
        $this->assertSame('admin', $admin->role->value);
        $this->assertTrue(Hash::check(config('seeding.password'), $admin->password));

        for ($i = 1; $i <= 5; $i++) {
            $member = User::where('email', "member{$i}@revira.test")->first();
            $this->assertNotNull($member);
            $this->assertSame(UserRole::Member, $member->role);
            $this->assertSame('member', $member->role->value);
            $this->assertTrue(Hash::check(config('seeding.password'), $member->password));
        }
    }

    public function test_seeder_covers_all_required_domain_statuses(): void
    {
        $this->seed();

        // 1. Membership statuses
        $this->assertTrue(Membership::where('status', 'active')->exists());
        $this->assertTrue(Membership::where('status', 'pending')->exists());
        $this->assertTrue(Membership::where('status', 'expired')->exists());
        $this->assertTrue(Membership::where('status', 'rejected')->exists());

        // 2. Transaction verification statuses
        $this->assertTrue(Transaction::where('verification_status', 'pending')->exists());
        $this->assertTrue(Transaction::where('verification_status', 'verified')->exists());
        $this->assertTrue(Transaction::where('verification_status', 'rejected')->exists());

        // 3. Class schedules
        $this->assertTrue(ClassSchedule::where('status', 'scheduled')->exists());
        $cancelledSchedule = ClassSchedule::where('status', 'cancelled')->first();
        $this->assertNotNull($cancelledSchedule);
        $this->assertNotEmpty($cancelledSchedule->cancel_reason);

        // 4. Class participants meeting min_participants vs below min_participants
        $schedulesWithParticipants = ClassSchedule::with(['gymClass', 'participants'])->has('participants')->get();
        $this->assertGreaterThanOrEqual(2, $schedulesWithParticipants->count());

        $hasMeetingMin = false;
        $hasBelowMin = false;

        foreach ($schedulesWithParticipants as $schedule) {
            $count = $schedule->participants->count();
            $min = $schedule->gymClass->min_participants;
            if ($count >= $min) {
                $hasMeetingMin = true;
            } else {
                $hasBelowMin = true;
            }
        }

        $this->assertTrue($hasMeetingMin, 'Must have at least one session meeting or exceeding min_participants.');
        $this->assertTrue($hasBelowMin, 'Must have at least one session below min_participants.');

        // 5. Operational hours
        $this->assertCount(7, OperationalHour::all());
        $this->assertTrue(OperationalHour::where('day_of_week', 'Minggu')->where('is_closed', true)->exists());
    }

    public function test_seeder_is_idempotent(): void
    {
        $this->seed();

        $countsBefore = [
            'users' => User::count(),
            'plans' => MembershipPlan::count(),
            'memberships' => Membership::count(),
            'transactions' => Transaction::count(),
            'operational_hours' => OperationalHour::count(),
            'instructors' => Instructor::count(),
            'classes' => GymClass::count(),
            'schedules' => ClassSchedule::count(),
            'participants' => ClassParticipant::count(),
        ];

        // Jalankan seed kedua kalinya
        $this->seed();

        $countsAfter = [
            'users' => User::count(),
            'plans' => MembershipPlan::count(),
            'memberships' => Membership::count(),
            'transactions' => Transaction::count(),
            'operational_hours' => OperationalHour::count(),
            'instructors' => Instructor::count(),
            'classes' => GymClass::count(),
            'schedules' => ClassSchedule::count(),
            'participants' => ClassParticipant::count(),
        ];

        $this->assertSame($countsBefore, $countsAfter, 'Table counts must remain identical after running seeder twice.');
    }

    public function test_seeder_defaults_to_password_when_seed_password_empty_in_testing(): void
    {
        config(['seeding.password' => '']);

        $this->seed();

        $admin = User::where('email', 'admin@revira.test')->first();
        $this->assertNotNull($admin);
        $this->assertTrue(Hash::check('password', $admin->password));
    }

    public function test_seeder_throws_exception_when_seed_password_empty_in_staging(): void
    {
        $this->app['env'] = 'staging';
        config(['seeding.password' => '']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('SEED_PASSWORD must be set to a secure non-default value in staging environment.');

        $seeder = new DatabaseSeeder;
        $seeder->run();
    }

    public function test_seeder_throws_exception_when_seed_password_is_default_in_staging(): void
    {
        $this->app['env'] = 'staging';
        config(['seeding.password' => 'password']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('SEED_PASSWORD must be set to a secure non-default value in staging environment.');

        $seeder = new DatabaseSeeder;
        $seeder->run();
    }

    public function test_seeder_succeeds_in_staging_with_strong_password_when_env_is_unavailable(): void
    {
        $this->app['env'] = 'staging';
        config(['seeding.password' => 'Str0ng-Staging-Seed-Pass!']);

        // Saat config di-cache, env() di luar config/ mengembalikan null.
        // Seeder harus tetap berhasil karena hanya membaca config('seeding.password').
        putenv('SEED_PASSWORD');
        unset($_ENV['SEED_PASSWORD'], $_SERVER['SEED_PASSWORD']);

        $this->seed();

        $admin = User::where('email', 'admin@revira.test')->first();
        $this->assertNotNull($admin);
        $this->assertTrue(Hash::check('Str0ng-Staging-Seed-Pass!', $admin->password));
    }

    public function test_seeder_throws_exception_in_production_environment(): void
    {
        $this->app['env'] = 'production';

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Seeding is only allowed in local, testing, or staging environments.');

        $seeder = new DatabaseSeeder;
        $seeder->run();
    }

    public function test_seeder_does_not_overwrite_tester_membership_or_transaction(): void
    {
        $this->seed();

        $plan = MembershipPlan::first();
        $tester = User::forceCreate([
            'name' => 'Tester Non-Seed',
            'email' => 'tester@example.com',
            'password' => Hash::make('password'),
            'role' => UserRole::Member,
        ]);

        $membership = Membership::create([
            'user_id' => $tester->id,
            'membership_plan_id' => $plan->id,
            'record_type' => 'registration',
            'start_date' => null,
            'end_date' => null,
            'status' => 'pending',
        ]);

        $transaction = Transaction::create([
            'user_id' => $tester->id,
            'membership_id' => $membership->id,
            'amount' => $plan->price,
            'payment_method' => 'on_the_spot',
            'receipt_image' => null,
            'verification_status' => 'pending',
            'verified_by' => null,
            'verified_at' => null,
            'reject_reason' => null,
        ]);

        $totalTransactionsBefore = Transaction::count();

        $this->seed();

        $transaction->refresh();
        $membership->refresh();

        $this->assertSame('pending', $membership->status);
        $this->assertSame('pending', $transaction->verification_status);
        $this->assertSame('on_the_spot', $transaction->payment_method);
        $this->assertNull($transaction->receipt_image);
        $this->assertNull($transaction->verified_by);
        $this->assertSame($totalTransactionsBefore, Transaction::count());
    }

    public function test_reseeding_after_days_does_not_attach_participants_to_past_sessions(): void
    {
        $this->seed();

        $this->travel(2)->days();
        $newToday = now('Asia/Makassar')->startOfDay()->toDateString();

        $pastScheduleIds = ClassSchedule::whereDate('schedule_date', '<', $newToday)->pluck('id');
        $pastParticipantsCountBefore = ClassParticipant::whereIn('class_schedule_id', $pastScheduleIds)->count();

        $yoga = GymClass::where('name', 'Yoga Morning Flow')->first();
        $instructor = Instructor::first();
        $pastUnbookedSchedule = ClassSchedule::create([
            'class_id' => $yoga->id,
            'instructor_id' => $instructor->id,
            'schedule_date' => now('Asia/Makassar')->subDay()->toDateString(),
            'start_time' => '06:00:00',
            'end_time' => '07:00:00',
            'status' => 'scheduled',
        ]);

        $this->seed();

        $pastParticipantsCountAfter = ClassParticipant::whereIn('class_schedule_id', $pastScheduleIds)->count();
        $this->assertSame($pastParticipantsCountBefore, $pastParticipantsCountAfter);
        $this->assertSame(0, ClassParticipant::where('class_schedule_id', $pastUnbookedSchedule->id)->count());

        $this->assertTrue(
            ClassParticipant::whereHas('classSchedule', function ($query) use ($newToday) {
                $query->whereDate('schedule_date', '>=', $newToday);
            })->exists()
        );
    }

    public function test_seeder_copies_dummy_receipt_image_to_public_storage(): void
    {
        Storage::fake('public');

        $this->seed();

        $pendingTx = Transaction::where('verification_status', 'pending')->first();
        $this->assertNotNull($pendingTx);
        $this->assertNotNull($pendingTx->receipt_image);
        Storage::disk('public')->assertExists($pendingTx->receipt_image);
    }
}
