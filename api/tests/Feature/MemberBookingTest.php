<?php

namespace Tests\Feature;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Membership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

class MemberBookingTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    /** Waktu "sekarang" di semua tes (WITA). */
    private const NOW = '2026-10-16 10:00:00';

    private const TODAY = '2026-10-16';

    private User $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse(self::NOW));

        $this->member = $this->actingAsMember();
        $this->activeMembership($this->member, '2026-10-01', '2026-10-30');
    }

    private function activeMembership(User $user, string $start, string $end): Membership
    {
        return Membership::factory()->for($user)->create([
            'start_date' => $start,
            'end_date' => $end,
            'status' => 'active',
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function schedule(array $attributes = []): ClassSchedule
    {
        return ClassSchedule::factory()->create(array_merge([
            'schedule_date' => '2026-10-17',
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => ClassSchedule::STATUS_SCHEDULED,
        ], $attributes));
    }

    private function bookingUrl(ClassSchedule|int $schedule): string
    {
        $id = $schedule instanceof ClassSchedule ? $schedule->id : $schedule;

        return "/api/v1/member/class-schedules/{$id}/booking";
    }

    private function participantsCount(ClassSchedule $schedule): int
    {
        return $this->getJson('/api/v1/class-schedules?date_from='.$schedule->schedule_date->format('Y-m-d'))
            ->json('data.0.participants_count');
    }

    /**
     * Memastikan member aktif dapat booking sesi scheduled yang belum dimulai.
     */
    public function test_active_member_can_book_session(): void
    {
        $class = GymClass::factory()->create(['name' => 'Yoga Pagi', 'min_participants' => 3]);
        $schedule = $this->schedule(['class_id' => $class->id, 'instructor_id' => $class->default_instructor_id]);

        $this->postJson($this->bookingUrl($schedule))
            ->assertCreated()
            ->assertExactJsonStructure([
                'message',
                'data' => [
                    'id', 'status', 'booked_at', 'updated_at',
                    'schedule' => [
                        'id', 'class_id', 'class_name', 'instructor_name', 'schedule_date', 'start_time', 'end_time',
                        'status', 'cancel_reason', 'participants_count', 'min_participants',
                    ],
                ],
            ])
            ->assertJson([
                'message' => 'Booking kelas berhasil.',
                'data' => [
                    'status' => 'booked',
                    'booked_at' => '2026-10-16T10:00:00+08:00',
                    'schedule' => [
                        'id' => $schedule->id,
                        'class_name' => 'Yoga Pagi',
                        'schedule_date' => '2026-10-17',
                        'start_time' => '08:00',
                        'end_time' => '09:00',
                        'status' => 'scheduled',
                        'participants_count' => 1,
                        'min_participants' => 3,
                    ],
                ],
            ]);

        $this->assertDatabaseHas('class_participants', [
            'class_schedule_id' => $schedule->id,
            'user_id' => $this->member->id,
            'status' => 'booked',
        ]);
    }

    /**
     * Memastikan booking ganda pada sesi yang sama ditolak 409 tanpa membuat baris baru.
     */
    public function test_double_booking_returns_conflict(): void
    {
        $schedule = $this->schedule();

        $this->postJson($this->bookingUrl($schedule))->assertCreated();

        $this->postJson($this->bookingUrl($schedule))
            ->assertConflict()
            ->assertExactJson(['message' => 'Anda sudah booking sesi kelas ini.']);

        $this->assertSame(1, ClassParticipant::count());
    }

    /**
     * Memastikan member yang sudah hadir (attended) juga tidak bisa booking ulang.
     */
    public function test_attended_participant_cannot_book_again(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->for($schedule)->for($this->member)->create(['status' => 'attended']);

        $this->postJson($this->bookingUrl($schedule))->assertConflict();
    }

    /**
     * Memastikan member tanpa membership yang aktif pada tanggal sesi ditolak 422.
     */
    public function test_member_inactive_on_session_date_cannot_book(): void
    {
        $this->postJson($this->bookingUrl($this->schedule(['schedule_date' => '2026-10-31'])))
            ->assertUnprocessable()
            ->assertJsonPath('errors.booking.0', 'Membership tidak aktif pada tanggal sesi.');

        $this->assertSame(0, ClassParticipant::count());
    }

    /**
     * Memastikan member tanpa membership sama sekali, atau hanya pending, ditolak 422.
     */
    public function test_member_without_active_membership_cannot_book(): void
    {
        $this->app['auth']->forgetGuards();
        $member = $this->createMember();
        Membership::factory()->for($member)->pending()->create();

        $this->withHeaders($this->bearerHeaders($member))
            ->postJson($this->bookingUrl($this->schedule()))
            ->assertUnprocessable()
            ->assertJsonPath('errors.booking.0', 'Membership tidak aktif pada tanggal sesi.');
    }

    /**
     * Memastikan perpanjangan yang sudah disetujui memungkinkan booking sesi di periode perpanjangan (B6).
     */
    public function test_extension_period_allows_booking_future_session(): void
    {
        $this->activeMembership($this->member, '2026-10-31', '2026-11-29');

        $this->postJson($this->bookingUrl($this->schedule(['schedule_date' => '2026-11-05'])))->assertCreated();
    }

    /**
     * Memastikan sesi yang sudah dimulai, sudah lewat, atau berjalan hari ini ditolak 422.
     */
    public function test_started_or_past_session_cannot_be_booked(): void
    {
        $past = $this->schedule(['schedule_date' => '2026-10-15']);
        $startedToday = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '10:00:00', 'end_time' => '11:00:00']);

        foreach ([$past, $startedToday] as $schedule) {
            $this->postJson($this->bookingUrl($schedule))
                ->assertUnprocessable()
                ->assertJsonPath('errors.booking.0', 'Sesi kelas ini sudah dimulai atau sudah lewat.');
        }

        $laterToday = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '10:01:00', 'end_time' => '11:00:00']);
        $this->postJson($this->bookingUrl($laterToday))->assertCreated();
    }

    /**
     * Memastikan sesi yang dibatalkan admin, sedang berjalan, atau selesai tidak bisa dibooking.
     */
    public function test_non_scheduled_session_cannot_be_booked(): void
    {
        $this->postJson($this->bookingUrl($this->schedule(['status' => 'cancelled', 'cancel_reason' => 'Instruktur sakit'])))
            ->assertUnprocessable()
            ->assertJsonPath('errors.booking.0', 'Sesi kelas ini sudah dibatalkan.');

        foreach (['ongoing', 'completed'] as $status) {
            $this->postJson($this->bookingUrl($this->schedule(['status' => $status])))
                ->assertUnprocessable()
                ->assertJsonPath('errors.booking.0', 'Sesi kelas ini sudah dimulai atau selesai.');
        }
    }

    /**
     * Memastikan booking ulang setelah batal mengaktifkan kembali baris lama dan memperbarui booked_at.
     */
    public function test_rebooking_after_cancel_reactivates_existing_row(): void
    {
        $schedule = $this->schedule();
        $old = ClassParticipant::factory()->for($schedule)->for($this->member)->create([
            'status' => 'cancelled',
            'booked_at' => '2026-10-14 09:00:00',
        ]);

        $this->postJson($this->bookingUrl($schedule))
            ->assertCreated()
            ->assertJsonPath('data.id', $old->id)
            ->assertJsonPath('data.status', 'booked')
            ->assertJsonPath('data.booked_at', '2026-10-16T10:00:00+08:00');

        $this->assertSame(1, ClassParticipant::count());
    }

    /**
     * Memastikan sesi tanpa batas kapasitas: banyak member tetap bisa booking melebihi min_participants.
     */
    public function test_booking_has_no_capacity_limit(): void
    {
        $class = GymClass::factory()->create(['min_participants' => 1]);
        $schedule = $this->schedule(['class_id' => $class->id, 'instructor_id' => $class->default_instructor_id]);
        ClassParticipant::factory()->count(30)->for($schedule)->create();

        $this->postJson($this->bookingUrl($schedule))
            ->assertCreated()
            ->assertJsonPath('data.schedule.participants_count', 31);
    }

    /**
     * Memastikan member dapat membatalkan booking miliknya; baris tetap ada dengan status cancelled.
     */
    public function test_member_can_cancel_own_booking(): void
    {
        $schedule = $this->schedule();
        $booking = ClassParticipant::factory()->for($schedule)->for($this->member)->create();

        $this->deleteJson($this->bookingUrl($schedule))
            ->assertOk()
            ->assertJsonPath('message', 'Booking kelas berhasil dibatalkan.')
            ->assertJsonPath('data.id', $booking->id)
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.schedule.participants_count', 0);

        $this->assertDatabaseHas('class_participants', ['id' => $booking->id, 'status' => 'cancelled']);
    }

    /**
     * Memastikan batal booking setelah sesi dimulai ditolak 422 dan booking tetap booked.
     */
    public function test_cannot_cancel_after_session_started(): void
    {
        $schedule = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '09:30:00', 'end_time' => '10:30:00']);
        $booking = ClassParticipant::factory()->for($schedule)->for($this->member)->create();

        $this->deleteJson($this->bookingUrl($schedule))
            ->assertUnprocessable()
            ->assertJsonPath('errors.booking.0', 'Booking tidak dapat dibatalkan karena sesi kelas sudah dimulai.');

        $this->assertSame('booked', $booking->fresh()->status);
    }

    /**
     * Memastikan booking yang sudah dibatalkan tidak bisa dibatalkan lagi.
     */
    public function test_cannot_cancel_already_cancelled_booking(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->for($schedule)->for($this->member)->create(['status' => 'cancelled']);

        $this->deleteJson($this->bookingUrl($schedule))
            ->assertUnprocessable()
            ->assertJsonPath('errors.booking.0', 'Booking ini sudah dibatalkan.');
    }

    /**
     * Memastikan member tidak bisa membatalkan booking orang lain (404) dan booking itu tidak berubah.
     */
    public function test_cannot_cancel_other_members_booking(): void
    {
        $schedule = $this->schedule();
        $other = ClassParticipant::factory()->for($schedule)->create();

        $this->deleteJson($this->bookingUrl($schedule))
            ->assertNotFound()
            ->assertExactJson(['message' => 'Booking tidak ditemukan.']);

        $this->assertSame('booked', $other->fresh()->status);
    }

    /**
     * Memastikan sesi yang tidak ada dibalas 404 untuk booking dan batal.
     */
    public function test_missing_session_returns_not_found(): void
    {
        $this->postJson($this->bookingUrl(999))->assertNotFound()->assertExactJson(['message' => 'Data tidak ditemukan.']);
        $this->deleteJson($this->bookingUrl(999))->assertNotFound();
    }

    /**
     * Memastikan participants_count di endpoint publik, polling status, dan admin naik/turun mengikuti booking/batal,
     * dan updated_at jadwal ikut berubah sehingga polling updated_since menangkapnya.
     */
    public function test_participants_count_follows_booking_and_cancel(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->for($schedule)->create();
        $schedule->forceFill(['updated_at' => '2026-10-15 08:00:00'])->saveQuietly();

        $this->assertSame(1, $this->participantsCount($schedule));

        $this->travelTo(CarbonImmutable::parse('2026-10-16 10:05:00'));
        $this->postJson($this->bookingUrl($schedule))->assertCreated();
        $this->assertSame(2, $this->participantsCount($schedule));

        $this->getJson('/api/v1/class-schedules/status?date_from=2026-10-17&updated_since=2026-10-16T10:05:00%2B08:00')
            ->assertOk()
            ->assertJsonPath('data.0.id', $schedule->id)
            ->assertJsonPath('data.0.participants_count', 2);

        $this->travelTo(CarbonImmutable::parse('2026-10-16 10:10:00'));
        $this->deleteJson($this->bookingUrl($schedule))->assertOk();
        $this->assertSame(1, $this->participantsCount($schedule));

        $this->getJson('/api/v1/class-schedules/status?date_from=2026-10-17&updated_since=2026-10-16T10:10:00%2B08:00')
            ->assertJsonPath('data.0.participants_count', 1);

        $this->app['auth']->forgetGuards();
        $this->withHeaders($this->bearerHeaders($this->createAdmin()))
            ->getJson("/api/v1/admin/class-schedules/{$schedule->id}")
            ->assertJsonPath('data.participants_count', 1);
    }

    /**
     * Memastikan daftar booking hanya berisi milik sendiri untuk sesi yang belum lewat, terurut, termasuk status sesi dan booking.
     */
    public function test_member_can_list_own_upcoming_bookings(): void
    {
        $later = $this->schedule(['schedule_date' => '2026-10-18']);
        $sooner = $this->schedule(['schedule_date' => '2026-10-17']);
        $cancelledByAdmin = $this->schedule(['schedule_date' => '2026-10-19', 'status' => 'cancelled', 'cancel_reason' => 'Libur']);
        $runningToday = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '09:30:00', 'end_time' => '10:30:00']);
        $endedToday = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '08:00:00', 'end_time' => '09:00:00']);
        $past = $this->schedule(['schedule_date' => '2026-10-15']);

        foreach ([$later, $sooner, $runningToday, $endedToday, $past] as $schedule) {
            ClassParticipant::factory()->for($schedule)->for($this->member)->create();
        }
        ClassParticipant::factory()->for($cancelledByAdmin)->for($this->member)->create(['status' => 'cancelled']);
        ClassParticipant::factory()->for($later)->create();
        ClassParticipant::factory()->for($this->schedule(['schedule_date' => '2026-10-20']))->create();

        $this->getJson('/api/v1/member/bookings')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.*.schedule.id', [$runningToday->id, $sooner->id, $later->id, $cancelledByAdmin->id])
            ->assertJsonPath('data.2.schedule.participants_count', 2)
            ->assertJsonPath('data.3.status', 'cancelled')
            ->assertJsonPath('data.3.schedule.status', 'cancelled')
            ->assertJsonPath('data.3.schedule.cancel_reason', 'Libur');
    }

    /**
     * Memastikan daftar booking kosong mengembalikan array kosong.
     */
    public function test_list_bookings_empty(): void
    {
        $this->getJson('/api/v1/member/bookings')->assertOk()->assertExactJson(['data' => []]);
    }

    /**
     * Memastikan semua endpoint booking menolak tanpa token (401) dan admin (403).
     */
    public function test_booking_endpoints_require_member_token(): void
    {
        $schedule = $this->schedule();
        $this->app['auth']->forgetGuards();

        $requests = [
            ['postJson', $this->bookingUrl($schedule)],
            ['deleteJson', $this->bookingUrl($schedule)],
            ['getJson', '/api/v1/member/bookings'],
        ];

        foreach ($requests as [$method, $url]) {
            $this->withHeaders(['Authorization' => ''])->{$method}($url)
                ->assertUnauthorized()
                ->assertExactJson(['message' => 'Unauthenticated.']);
        }

        $admin = $this->createAdmin();
        $this->activeMembership($admin, '2026-10-01', '2026-10-30');

        foreach ($requests as [$method, $url]) {
            $this->app['auth']->forgetGuards();
            $this->withHeaders($this->bearerHeaders($admin))->{$method}($url)->assertForbidden();
        }

        $this->assertSame(0, ClassParticipant::count());
    }
}
