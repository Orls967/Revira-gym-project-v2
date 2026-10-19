<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\User;
use App\Services\Memberships\MembershipStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class MembershipStatusTest extends TestCase
{
    use RefreshDatabase;

    private MembershipStatus $status;

    protected function setUp(): void
    {
        parent::setUp();

        $this->status = app(MembershipStatus::class);
    }

    /**
     * Memastikan membership yang periodenya mencakup hari ini terhitung aktif, termasuk hari pertama dan terakhir.
     */
    public function test_membership_running_today_is_active(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'start_date' => today()->toDateString(),
            'end_date' => today()->addDays(29)->toDateString(),
        ]);

        $this->assertTrue($this->status->isActiveToday($user));
        $this->assertTrue($this->status->isActiveOn($user, today()->addDays(29)));
        $this->assertSame(1, Membership::currentlyActive()->count());
    }

    /**
     * Memastikan membership active yang belum mulai tidak membuat member aktif lebih awal.
     */
    public function test_membership_not_started_yet_is_not_active(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'start_date' => today()->addDay()->toDateString(),
            'end_date' => today()->addDays(30)->toDateString(),
        ]);

        $this->assertFalse($this->status->isActiveToday($user));
        $this->assertTrue($this->status->isActiveOn($user, today()->addDay()));
        $this->assertSame(0, Membership::currentlyActive()->count());
    }

    /**
     * Memastikan membership yang end_date-nya sudah lewat tidak aktif walau status masih active.
     */
    public function test_membership_past_end_date_is_not_active(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'start_date' => today()->subDays(31)->toDateString(),
            'end_date' => today()->subDay()->toDateString(),
        ]);

        $this->assertFalse($this->status->isActiveToday($user));
        $this->assertTrue($this->status->isActiveOn($user, today()->subDay()));
    }

    /**
     * Memastikan status selain active (pending, rejected, expired) tidak pernah terhitung aktif.
     */
    public function test_non_active_statuses_are_not_active(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->pending()->create();
        Membership::factory()->for($user)->rejected()->create();
        Membership::factory()->for($user)->create([
            'start_date' => today()->subDays(10)->toDateString(),
            'end_date' => today()->addDays(20)->toDateString(),
            'status' => 'expired',
        ]);

        $this->assertFalse($this->status->isActiveToday($user));
    }

    /**
     * Memastikan dua membership active berurutan (berjalan + perpanjangan) memilih yang berlaku pada tanggalnya.
     */
    public function test_sequential_memberships_resolve_by_date(): void
    {
        $user = User::factory()->create();
        $running = Membership::factory()->for($user)->create([
            'record_type' => 'registration',
            'start_date' => today()->subDays(20)->toDateString(),
            'end_date' => today()->addDays(9)->toDateString(),
        ]);
        $extension = Membership::factory()->for($user)->create([
            'record_type' => 'extension',
            'start_date' => today()->addDays(10)->toDateString(),
            'end_date' => today()->addDays(39)->toDateString(),
        ]);

        $this->assertTrue($running->is($this->status->activeOn($user, today())));
        $this->assertTrue($running->is($this->status->activeOn($user, today()->addDays(9))));
        $this->assertTrue($extension->is($this->status->activeOn($user, today()->addDays(10))));
        $this->assertNull($this->status->activeOn($user, today()->addDays(40)));
    }

    /**
     * Memastikan tanggal dalam bentuk string ikut didukung (mis. schedule_date sesi).
     */
    public function test_active_on_accepts_date_string(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create();

        $this->assertTrue($this->status->isActiveOn($user, today()->addDays(5)->toDateString()));
    }

    /**
     * Memastikan ensureActiveOn melempar 422 berpesan bahasa Indonesia bila member tidak aktif pada tanggal sesi.
     */
    public function test_ensure_active_on_throws_validation_error(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create();

        $this->status->ensureActiveOn($user, today());

        try {
            $this->status->ensureActiveOn($user, today()->addDays(31), 'class_schedule_id');
            $this->fail('ValidationException tidak dilempar.');
        } catch (ValidationException $e) {
            $this->assertSame(['class_schedule_id' => [MembershipStatus::INACTIVE_ON_DATE_MESSAGE]], $e->errors());
            $this->assertSame('Membership tidak aktif pada tanggal sesi.', MembershipStatus::INACTIVE_ON_DATE_MESSAGE);
        }
    }

    /**
     * Memastikan cek tumpang tindih menolak periode beririsan tetapi mengizinkan periode berurutan.
     */
    public function test_overlaps_active_detects_overlapping_periods(): void
    {
        $user = User::factory()->create();
        $running = Membership::factory()->for($user)->create([
            'start_date' => today()->subDays(20)->toDateString(),
            'end_date' => today()->addDays(9)->toDateString(),
        ]);
        Membership::factory()->for($user)->pending()->create();

        $this->assertTrue($this->status->overlapsActive($user, today()->addDays(9), today()->addDays(38)));
        $this->assertFalse($this->status->overlapsActive($user, today()->addDays(10), today()->addDays(39)));
        $this->assertFalse($this->status->overlapsActive($user, today(), today()->addDays(9), $running));
        $this->assertFalse($this->status->overlapsActive(User::factory()->create(), today(), today()->addDays(9)));
    }

    /**
     * Memastikan batas hari mengikuti WITA: pukul 23.30 WITA masih dihitung tanggal yang sama.
     */
    public function test_today_follows_app_timezone(): void
    {
        $this->travelTo(Carbon::parse('2026-10-19 23:30:00', 'Asia/Makassar'));
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'start_date' => '2026-10-20',
            'end_date' => '2026-11-18',
        ]);

        $this->assertFalse($this->status->isActiveToday($user));

        $this->travelTo(Carbon::parse('2026-10-20 00:00:00', 'Asia/Makassar'));

        $this->assertTrue($this->status->isActiveToday($user));
    }
}
