<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Memastikan member dengan membership aktif mendapat profil lengkap dan is_active true.
     */
    public function test_me_returns_profile_with_active_membership(): void
    {
        $user = User::factory()->create();
        $plan = MembershipPlan::factory()->create(['name' => 'Bulanan', 'duration_days' => 30]);
        Membership::factory()->for($user)->for($plan)->create([
            'start_date' => today()->subDays(10)->toDateString(),
            'end_date' => today()->addDays(20)->toDateString(),
            'status' => 'active',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertExactJsonStructure([
                'data' => [
                    'id', 'name', 'email', 'phone_number', 'profile_photo', 'role',
                    'membership' => [
                        'is_active', 'status', 'start_date', 'end_date',
                        'plan' => ['id', 'name', 'duration_days'],
                    ],
                ],
            ])
            ->assertJson([
                'data' => [
                    'id' => $user->id,
                    'email' => $user->email,
                    'phone_number' => $user->phone_number,
                    'role' => 'member',
                    'membership' => [
                        'is_active' => true,
                        'status' => 'active',
                        'plan' => ['id' => $plan->id, 'name' => 'Bulanan', 'duration_days' => 30],
                        'start_date' => today()->subDays(10)->toDateString(),
                        'end_date' => today()->addDays(20)->toDateString(),
                    ],
                ],
            ]);
    }

    /**
     * Memastikan membership masih aktif pada hari terakhirnya (end_date = hari ini).
     */
    public function test_membership_is_active_on_its_last_day(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create(['end_date' => today()->toDateString()]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')->assertJsonPath('data.membership.is_active', true);
    }

    /**
     * Memastikan member tanpa riwayat membership mendapat status none.
     */
    public function test_me_without_membership_returns_none(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.membership', [
                'is_active' => false,
                'status' => 'none',
                'plan' => null,
                'start_date' => null,
                'end_date' => null,
            ]);
    }

    /**
     * Memastikan membership pending belum mengaktifkan booking.
     */
    public function test_me_with_pending_membership_is_not_active(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->pending()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', false)
            ->assertJsonPath('data.membership.status', 'pending')
            ->assertJsonPath('data.membership.start_date', null);
    }

    /**
     * Memastikan status active yang end_date-nya sudah lewat dilaporkan expired walau job expiry belum jalan.
     */
    public function test_active_status_past_end_date_is_reported_expired(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'start_date' => today()->subDays(31)->toDateString(),
            'end_date' => today()->subDay()->toDateString(),
            'status' => 'active',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', false)
            ->assertJsonPath('data.membership.status', 'expired');
    }

    /**
     * Memastikan membership aktif tetap diprioritaskan walau ada catatan lebih baru (mis. perpanjangan pending).
     */
    public function test_active_membership_takes_priority_over_newer_pending_extension(): void
    {
        $user = User::factory()->create();
        $active = Membership::factory()->for($user)->create(['record_type' => 'registration']);
        Membership::factory()->for($user)->pending()->create(['record_type' => 'extension']);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', true)
            ->assertJsonPath('data.membership.status', 'active')
            ->assertJsonPath('data.membership.plan.id', $active->membership_plan_id);
    }

    /**
     * Memastikan membership active yang belum mulai tidak mengaktifkan booking dan dilaporkan upcoming.
     */
    public function test_membership_not_started_yet_is_reported_upcoming(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->expired()->create(['record_type' => 'registration']);
        Membership::factory()->for($user)->create([
            'record_type' => 'extension',
            'start_date' => today()->addDay()->toDateString(),
            'end_date' => today()->addDays(30)->toDateString(),
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', false)
            ->assertJsonPath('data.membership.status', 'upcoming')
            ->assertJsonPath('data.membership.start_date', today()->addDay()->toDateString());
    }

    /**
     * Memastikan membership upcoming tetap ditampilkan walau ada catatan lebih baru yang ditolak.
     */
    public function test_upcoming_membership_takes_priority_over_newer_rejected_record(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'start_date' => today()->addDays(3)->toDateString(),
            'end_date' => today()->addDays(32)->toDateString(),
        ]);
        Membership::factory()->for($user)->rejected()->create(['record_type' => 'extension']);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')->assertJsonPath('data.membership.status', 'upcoming');
    }

    /**
     * Memastikan dengan dua membership active berurutan, yang sedang berjalan yang ditampilkan, bukan perpanjangannya.
     */
    public function test_running_membership_is_shown_before_its_approved_extension(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'record_type' => 'registration',
            'start_date' => today()->subDays(25)->toDateString(),
            'end_date' => today()->addDays(4)->toDateString(),
        ]);
        Membership::factory()->for($user)->create([
            'record_type' => 'extension',
            'start_date' => today()->addDays(5)->toDateString(),
            'end_date' => today()->addDays(34)->toDateString(),
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', true)
            ->assertJsonPath('data.membership.status', 'active')
            ->assertJsonPath('data.membership.start_date', today()->subDays(25)->toDateString())
            ->assertJsonPath('data.membership.end_date', today()->addDays(4)->toDateString());
    }

    /**
     * Memastikan setelah membership berjalan habis, perpanjangan yang sudah mulai membuat member tetap aktif.
     */
    public function test_extension_becomes_active_once_it_starts(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->create([
            'record_type' => 'registration',
            'start_date' => today()->subDays(30)->toDateString(),
            'end_date' => today()->subDay()->toDateString(),
        ]);
        Membership::factory()->for($user)->create([
            'record_type' => 'extension',
            'start_date' => today()->toDateString(),
            'end_date' => today()->addDays(29)->toDateString(),
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', true)
            ->assertJsonPath('data.membership.start_date', today()->toDateString());
    }

    /**
     * Memastikan tanpa membership aktif, status diambil dari catatan terbaru (mis. perpanjangan ditolak).
     */
    public function test_without_active_membership_latest_record_status_is_used(): void
    {
        $user = User::factory()->create();
        Membership::factory()->for($user)->expired()->create(['record_type' => 'registration']);
        Membership::factory()->for($user)->create([
            'record_type' => 'extension',
            'start_date' => null,
            'end_date' => null,
            'status' => 'rejected',
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertJsonPath('data.membership.is_active', false)
            ->assertJsonPath('data.membership.status', 'rejected');
    }

    /**
     * Memastikan membership milik user lain tidak ikut terbaca.
     */
    public function test_me_ignores_other_users_memberships(): void
    {
        Membership::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/me')->assertJsonPath('data.membership.status', 'none');
    }

    /**
     * Memastikan /me tanpa token ditolak 401 dan admin ditolak 403.
     */
    public function test_me_requires_member_token(): void
    {
        $this->getJson('/api/v1/me')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        Sanctum::actingAs(User::factory()->admin()->create());

        $this->getJson('/api/v1/me')->assertForbidden();
    }
}
