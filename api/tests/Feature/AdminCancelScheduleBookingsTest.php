<?php

namespace Tests\Feature;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Membership;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

/**
 * Pembatalan sesi oleh admin ikut membatalkan booking peserta (SCRUM-94, aturan B9 di SCRUM-25).
 */
class AdminCancelScheduleBookingsTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    /** Waktu "sekarang" di semua tes (WITA). */
    private const NOW = '2026-10-16 10:00:00';

    private const TODAY = '2026-10-16';

    private const REASON = 'Instruktur berhalangan hadir';

    private GymClass $class;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse(self::NOW));
        $this->class = GymClass::factory()->create(['min_participants' => 5]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function schedule(array $attributes = []): ClassSchedule
    {
        return ClassSchedule::factory()->create(array_merge([
            'class_id' => $this->class->id,
            'instructor_id' => $this->class->default_instructor_id,
            'schedule_date' => '2026-10-17',
            'start_time' => '08:00:00',
            'end_time' => '09:00:00',
            'status' => ClassSchedule::STATUS_SCHEDULED,
        ], $attributes));
    }

    private function statusUrl(ClassSchedule $schedule): string
    {
        return "/api/v1/admin/class-schedules/{$schedule->id}/status";
    }

    private function cancel(ClassSchedule $schedule, ?string $reason = self::REASON): TestResponse
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders($this->bearerHeaders($this->createAdmin()))
            ->patchJson($this->statusUrl($schedule), array_filter(['status' => 'cancelled', 'cancel_reason' => $reason]));
    }

    /**
     * Memastikan semua booking booked ikut cancelled, booking yang sudah batal tetap, dan jumlahnya dikembalikan di meta.
     */
    public function test_cancelling_schedule_cancels_all_booked_participants(): void
    {
        $schedule = $this->schedule();
        $booked = ClassParticipant::factory()->count(3)->for($schedule)->create();
        $alreadyCancelled = ClassParticipant::factory()->for($schedule)->create(['status' => 'cancelled']);
        $otherSchedule = $this->schedule(['start_time' => '10:00:00', 'end_time' => '11:00:00']);
        $otherBooking = ClassParticipant::factory()->for($otherSchedule)->create();

        $this->cancel($schedule)
            ->assertOk()
            ->assertExactJsonStructure([
                'message',
                'data' => [
                    'id', 'class_id', 'class_name', 'instructor_id', 'instructor_name', 'schedule_date', 'start_time',
                    'end_time', 'status', 'cancel_reason', 'participants_count', 'min_participants', 'created_at', 'updated_at',
                ],
                'meta' => ['cancelled_bookings_count'],
            ])
            ->assertJsonPath('message', 'Status jadwal berhasil diperbarui.')
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancel_reason', self::REASON)
            ->assertJsonPath('data.participants_count', 0)
            ->assertJsonPath('meta.cancelled_bookings_count', 3);

        foreach ($booked as $participant) {
            $this->assertSame('cancelled', $participant->fresh()->status);
        }
        $this->assertSame('cancelled', $alreadyCancelled->fresh()->status);
        $this->assertSame('booked', $otherBooking->fresh()->status);
        $this->assertSame(4, ClassParticipant::where('class_schedule_id', $schedule->id)->count());
    }

    /**
     * Memastikan sesi tanpa peserta tetap bisa dibatalkan dengan cancelled_bookings_count 0,
     * tanpa syarat jumlah peserta di bawah minimum.
     */
    public function test_cancelling_schedule_without_bookings_returns_zero(): void
    {
        $schedule = $this->schedule();

        $this->cancel($schedule)
            ->assertOk()
            ->assertJsonPath('meta.cancelled_bookings_count', 0);
    }

    /**
     * Memastikan sesi yang pesertanya sudah memenuhi minimum tetap bisa dibatalkan (tidak dibatasi "peserta < minimum").
     */
    public function test_schedule_meeting_minimum_participants_can_still_be_cancelled(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->count(6)->for($schedule)->create();

        $this->cancel($schedule)->assertOk()->assertJsonPath('meta.cancelled_bookings_count', 6);
    }

    /**
     * Memastikan sesi yang sudah dimulai (masih scheduled atau sudah ongoing) tidak bisa dibatalkan dan booking tidak berubah.
     */
    public function test_started_schedule_cannot_be_cancelled(): void
    {
        $started = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '10:00:00', 'end_time' => '11:00:00']);
        $booking = ClassParticipant::factory()->for($started)->create();

        $this->cancel($started)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Jadwal yang sudah dimulai tidak dapat dibatalkan.']);

        $this->assertSame('scheduled', $started->fresh()->status);
        $this->assertSame('booked', $booking->fresh()->status);

        $ongoing = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '09:00:00', 'end_time' => '10:30:00', 'status' => 'ongoing']);
        ClassParticipant::factory()->for($ongoing)->create();

        $this->cancel($ongoing)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Status jadwal tidak dapat diubah dari ongoing ke cancelled.']);

        $this->assertSame(1, $ongoing->participants()->where('status', 'booked')->count());
    }

    /**
     * Memastikan sesi yang dimulai satu menit lagi masih bisa dibatalkan.
     */
    public function test_schedule_starting_soon_can_still_be_cancelled(): void
    {
        $schedule = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '10:01:00', 'end_time' => '11:00:00']);
        ClassParticipant::factory()->for($schedule)->create();

        $this->cancel($schedule)->assertOk()->assertJsonPath('meta.cancelled_bookings_count', 1);
    }

    /**
     * Memastikan pembatalan tanpa alasan ditolak 422 dan booking tidak berubah.
     */
    public function test_cancel_without_reason_keeps_bookings(): void
    {
        $schedule = $this->schedule();
        $booking = ClassParticipant::factory()->for($schedule)->create();

        $this->cancel($schedule, null)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cancel_reason' => 'Alasan pembatalan wajib diisi bila jadwal dibatalkan.']);

        $this->assertSame('booked', $booking->fresh()->status);
    }

    /**
     * Memastikan transisi selain cancelled mengembalikan cancelled_bookings_count 0 dan tidak menyentuh booking.
     */
    public function test_other_transitions_do_not_touch_bookings(): void
    {
        $schedule = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '09:00:00', 'end_time' => '11:00:00']);
        $booking = ClassParticipant::factory()->for($schedule)->create();
        $this->actingAsAdmin();

        $this->patchJson($this->statusUrl($schedule), ['status' => 'ongoing'])
            ->assertOk()
            ->assertJsonPath('meta.cancelled_bookings_count', 0)
            ->assertJsonPath('data.participants_count', 1);

        $this->assertSame('booked', $booking->fresh()->status);
    }

    /**
     * Memastikan mengaktifkan kembali sesi tidak memulihkan booking; member harus booking ulang.
     */
    public function test_rescheduling_does_not_restore_bookings(): void
    {
        $schedule = $this->schedule();
        $booking = ClassParticipant::factory()->for($schedule)->create();
        $this->cancel($schedule)->assertOk();

        $this->actingAsAdmin();
        $this->patchJson($this->statusUrl($schedule), ['status' => 'scheduled'])
            ->assertOk()
            ->assertJsonPath('data.participants_count', 0)
            ->assertJsonPath('meta.cancelled_bookings_count', 0);

        $this->assertSame('cancelled', $booking->fresh()->status);
    }

    /**
     * Memastikan endpoint publik, polling status, dan daftar booking member mencerminkan pembatalan (status, alasan, counter 0).
     */
    public function test_public_endpoints_and_member_bookings_reflect_cancellation(): void
    {
        $schedule = $this->schedule();
        $member = $this->createMember();
        Membership::factory()->for($member)->create(['start_date' => '2026-10-01', 'end_date' => '2026-10-30']);
        ClassParticipant::factory()->for($schedule)->for($member)->create();
        ClassParticipant::factory()->for($schedule)->create();
        $schedule->forceFill(['updated_at' => '2026-10-15 08:00:00'])->saveQuietly();

        $this->travelTo(CarbonImmutable::parse('2026-10-16 10:05:00'));
        $this->cancel($schedule)->assertOk();
        $this->app['auth']->forgetGuards();

        $this->withHeaders(['Authorization' => ''])
            ->getJson('/api/v1/class-schedules?date_from=2026-10-17')
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.cancel_reason', self::REASON)
            ->assertJsonPath('data.0.participants_count', 0);

        $this->getJson('/api/v1/class-schedules/status?date_from=2026-10-17&updated_since=2026-10-16T10:05:00%2B08:00')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $schedule->id)
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.participants_count', 0);

        $this->withHeaders($this->bearerHeaders($member))
            ->getJson('/api/v1/member/bookings')
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.schedule.status', 'cancelled')
            ->assertJsonPath('data.0.schedule.cancel_reason', self::REASON);
    }

    /**
     * Memastikan member tidak bisa booking sesi yang sudah dibatalkan admin.
     */
    public function test_member_cannot_book_cancelled_schedule(): void
    {
        $schedule = $this->schedule();
        $this->cancel($schedule)->assertOk();

        $this->app['auth']->forgetGuards();
        /** @var User $member */
        $member = $this->createMember();
        Membership::factory()->for($member)->create(['start_date' => '2026-10-01', 'end_date' => '2026-10-30']);

        $this->withHeaders($this->bearerHeaders($member))
            ->postJson("/api/v1/member/class-schedules/{$schedule->id}/booking")
            ->assertUnprocessable()
            ->assertJsonPath('errors.booking.0', 'Sesi kelas ini sudah dibatalkan.');
    }
}
