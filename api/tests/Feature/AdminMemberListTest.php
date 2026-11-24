<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminMemberListTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/admin/members';

    private MembershipPlan $plan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(now()->setDate(2026, 11, 1)->setTime(10, 0));
        $this->plan = MembershipPlan::factory()->create(['name' => '1 Bulan Reguler', 'duration_days' => 30]);
    }

    private function actingAsAdmin(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create(['name' => 'Admin Revira']));
    }

    private function member(string $name, array $attributes = []): User
    {
        return User::factory()->create(array_merge(['name' => $name, 'role' => UserRole::Member], $attributes));
    }

    private function membership(User $user, string $state, array $attributes = []): Membership
    {
        $factory = Membership::factory();
        if ($state !== 'active') {
            $factory = $factory->{$state}();
        }

        return $factory->create(array_merge([
            'user_id' => $user->id,
            'membership_plan_id' => $this->plan->id,
        ], $attributes));
    }

    /**
     * Satu member untuk setiap status terkini, dipakai beberapa tes filter.
     *
     * @return array<string, User>
     */
    private function seedMembersPerStatus(): array
    {
        $active = $this->member('Andi Aktif');
        $this->membership($active, 'active', ['start_date' => '2026-10-15', 'end_date' => '2026-11-14']);
        // Pengajuan perpanjangan pending tidak menutupi membership yang sedang berjalan.
        $this->membership($active, 'pending');

        $pending = $this->member('Budi Pending');
        $this->membership($pending, 'expired');
        $this->membership($pending, 'pending', ['start_date' => '2026-11-05']);

        $expired = $this->member('Citra Expired');
        $this->membership($expired, 'expired', ['start_date' => '2026-09-01', 'end_date' => '2026-09-30']);
        $this->membership($expired, 'rejected');

        // Status active tetapi end_date lewat (job expiry belum jalan) tetap dihitung expired.
        $lapsed = $this->member('Dewi Lewat');
        $this->membership($lapsed, 'active', ['start_date' => '2026-09-01', 'end_date' => '2026-10-31']);

        $rejectedOnly = $this->member('Eko Ditolak');
        $this->membership($rejectedOnly, 'rejected');

        $noMembership = $this->member('Fajar Baru');

        return compact('active', 'pending', 'expired', 'lapsed', 'rejectedOnly', 'noMembership');
    }

    /**
     * @return array<int, string>
     */
    private function names(string $query = ''): array
    {
        return collect($this->getJson(self::URL.$query)->assertOk()->json('data'))->pluck('name')->all();
    }

    /**
     * Tanpa filter: semua member (bukan admin) urut nama, dengan struktur item dan paginasi lengkap.
     */
    public function test_admin_lists_members_sorted_by_name_with_complete_structure(): void
    {
        $this->seedMembersPerStatus();
        $this->actingAsAdmin();

        $response = $this->getJson(self::URL);

        $response->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'name', 'email', 'phone_number', 'membership_status',
                        'plan', 'start_date', 'end_date', 'registered_at',
                    ],
                ],
                'links' => ['first', 'last', 'prev', 'next'],
                'meta' => ['current_page', 'from', 'last_page', 'links', 'path', 'per_page', 'to', 'total'],
            ])
            ->assertJsonPath('meta.per_page', 15);

        $this->assertSame(
            ['Andi Aktif', 'Budi Pending', 'Citra Expired', 'Dewi Lewat', 'Eko Ditolak', 'Fajar Baru'],
            collect($response->json('data'))->pluck('name')->all(),
        );
        $this->assertSame(
            ['active', 'pending', 'expired', 'expired', 'none', 'none'],
            collect($response->json('data'))->pluck('membership_status')->all(),
        );
    }

    /**
     * Urutan mengikuti nama, bukan urutan pembuatan (id); nama sama diurutkan berdasarkan id.
     */
    public function test_members_are_sorted_by_name_not_creation_order(): void
    {
        $zaki = $this->member('Zaki Terakhir');
        $budiFirst = $this->member('Budi Sama');
        $andi = $this->member('Andi Awal');
        $budiSecond = $this->member('Budi Sama');
        $this->actingAsAdmin();

        $ids = collect($this->getJson(self::URL)->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame([$andi->id, $budiFirst->id, $budiSecond->id, $zaki->id], $ids);
    }

    /**
     * Item member aktif memakai paket dan tanggal dari membership yang berlaku hari ini.
     */
    public function test_active_item_shows_current_membership_plan_and_dates(): void
    {
        $member = $this->member('Andi Aktif', ['email' => 'andi@revira.test', 'phone_number' => '081234567890']);
        $this->membership($member, 'expired', ['start_date' => '2026-09-01', 'end_date' => '2026-09-30']);
        $this->membership($member, 'active', ['start_date' => '2026-10-15', 'end_date' => '2026-11-14']);
        $this->actingAsAdmin();

        $item = $this->getJson(self::URL)->assertOk()->json('data.0');

        $this->assertSame([
            'id' => $member->id,
            'name' => 'Andi Aktif',
            'email' => 'andi@revira.test',
            'phone_number' => '081234567890',
            'membership_status' => 'active',
            'plan' => ['id' => $this->plan->id, 'name' => '1 Bulan Reguler', 'duration_days' => 30],
            'start_date' => '2026-10-15',
            'end_date' => '2026-11-14',
            'registered_at' => $member->created_at->toIso8601String(),
        ], $item);
        $this->assertStringEndsWith('+08:00', $item['registered_at']);
    }

    /**
     * Member dengan status none (tanpa membership atau hanya rejected) tidak punya paket dan tanggal.
     */
    public function test_none_item_has_null_plan_and_dates(): void
    {
        $member = $this->member('Eko Ditolak');
        $this->membership($member, 'rejected');
        $this->actingAsAdmin();

        $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonPath('data.0.membership_status', 'none')
            ->assertJsonPath('data.0.plan', null)
            ->assertJsonPath('data.0.start_date', null)
            ->assertJsonPath('data.0.end_date', null);
    }

    public function test_filter_status_active(): void
    {
        $this->seedMembersPerStatus();
        $this->actingAsAdmin();

        $this->assertSame(['Andi Aktif'], $this->names('?status=active'));
    }

    public function test_filter_status_pending(): void
    {
        $this->seedMembersPerStatus();
        $this->actingAsAdmin();

        $this->assertSame(['Budi Pending'], $this->names('?status=pending'));
    }

    public function test_filter_status_expired(): void
    {
        $this->seedMembersPerStatus();
        $this->actingAsAdmin();

        $this->assertSame(['Citra Expired', 'Dewi Lewat'], $this->names('?status=expired'));
    }

    /**
     * Status none mencakup member tanpa membership dan member yang hanya punya pengajuan rejected.
     */
    public function test_filter_status_none_includes_rejected_only(): void
    {
        $this->seedMembersPerStatus();
        $this->actingAsAdmin();

        $this->assertSame(['Eko Ditolak', 'Fajar Baru'], $this->names('?status=none'));
    }

    /**
     * Pending hanya untuk pengajuan yang menunggu verifikasi (B11). Membership yang sudah disetujui tetapi
     * belum mulai diabaikan: member tanpa riwayat lain dihitung none.
     */
    public function test_upcoming_only_membership_counts_as_none(): void
    {
        $member = $this->member('Gita Upcoming');
        $this->membership($member, 'active', ['start_date' => '2026-11-10', 'end_date' => '2026-12-09']);
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?status=none')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.membership_status', 'none')
            ->assertJsonPath('data.0.plan', null)
            ->assertJsonPath('data.0.start_date', null);
        $this->assertSame([], $this->names('?status=active'));
        $this->assertSame([], $this->names('?status=pending'));
    }

    /**
     * Member yang masa lamanya sudah habis dan perpanjangannya disetujui tetapi belum mulai dihitung expired,
     * dengan paket dan tanggal dari membership yang sudah habis.
     */
    public function test_upcoming_extension_after_lapsed_membership_counts_as_expired(): void
    {
        $member = $this->member('Hadi Jeda');
        $this->membership($member, 'expired', ['start_date' => '2026-09-01', 'end_date' => '2026-09-30']);
        $this->membership($member, 'active', ['start_date' => '2026-11-10', 'end_date' => '2026-12-09']);
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?status=expired')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.membership_status', 'expired')
            ->assertJsonPath('data.0.start_date', '2026-09-01')
            ->assertJsonPath('data.0.end_date', '2026-09-30');
        $this->assertSame([], $this->names('?status=pending'));
    }

    /**
     * Filter paket memakai paket pada membership terkini, bukan paket lama di riwayat.
     */
    public function test_filter_by_membership_plan_uses_current_membership(): void
    {
        $quarterly = MembershipPlan::factory()->create(['name' => '3 Bulan Reguler', 'duration_days' => 90]);

        $switched = $this->member('Hana Pindah');
        $this->membership($switched, 'expired', ['membership_plan_id' => $quarterly->id, 'end_date' => '2026-08-01']);
        $this->membership($switched, 'active', ['start_date' => '2026-10-15', 'end_date' => '2026-11-14']);

        $quarterlyMember = $this->member('Indra Triwulan');
        $this->membership($quarterlyMember, 'expired', ['membership_plan_id' => $quarterly->id]);

        $this->member('Joko Kosong');
        $this->actingAsAdmin();

        $this->assertSame(['Indra Triwulan'], $this->names('?membership_plan_id='.$quarterly->id));
        $this->assertSame(['Hana Pindah'], $this->names('?membership_plan_id='.$this->plan->id));
        $this->assertSame([], $this->names('?membership_plan_id='.$quarterly->id.'&status=active'));
        $this->assertSame(['Indra Triwulan'], $this->names('?membership_plan_id='.$quarterly->id.'&status=expired'));
        $this->assertSame([], $this->names('?membership_plan_id='.$quarterly->id.'&status=none'));
    }

    public function test_search_by_name_email_or_phone(): void
    {
        $this->member('Siti Rahmah', ['email' => 'siti@revira.test', 'phone_number' => '081111111111']);
        $this->member('Ahmad Fauzi', ['email' => 'fauzi@contoh.test', 'phone_number' => '082222222222']);
        $this->member('Rina Wati', ['email' => 'rina@contoh.test', 'phone_number' => '083333333333']);
        $this->actingAsAdmin();

        $this->assertSame(['Siti Rahmah'], $this->names('?search=rahmah'));
        $this->assertSame(['Ahmad Fauzi'], $this->names('?search=fauzi@contoh'));
        $this->assertSame(['Rina Wati'], $this->names('?search=0833333'));
        $this->assertSame(['Ahmad Fauzi', 'Rina Wati'], $this->names('?search=contoh.test'));
        // % dicari apa adanya, bukan wildcard.
        $this->assertSame([], $this->names('?search=%25'));
    }

    public function test_search_combines_with_status_filter(): void
    {
        $this->seedMembersPerStatus();
        $this->actingAsAdmin();

        $this->assertSame(['Eko Ditolak'], $this->names('?status=none&search=eko'));
        $this->assertSame([], $this->names('?status=active&search=eko'));
    }

    /**
     * Paginasi 15 per halaman dihitung setelah filter status di database.
     */
    public function test_pagination_15_per_page_after_status_filter(): void
    {
        for ($i = 1; $i <= 17; $i++) {
            $member = $this->member(sprintf('Aktif %02d', $i));
            $this->membership($member, 'active');
        }
        for ($i = 1; $i <= 5; $i++) {
            $this->member(sprintf('Baru %02d', $i));
        }
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?status=active')
            ->assertOk()
            ->assertJsonCount(15, 'data')
            ->assertJsonPath('meta.total', 17)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('data.0.name', 'Aktif 01');

        $this->getJson(self::URL.'?status=active&page=2')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Aktif 16')
            ->assertJsonPath('data.1.name', 'Aktif 17');

        $this->assertStringContainsString(
            'status=active',
            $this->getJson(self::URL.'?status=active')->json('links.next'),
        );
    }

    /**
     * Jumlah query tidak bertambah seiring jumlah member di halaman (tanpa N+1).
     */
    public function test_query_count_does_not_grow_with_members(): void
    {
        $this->actingAsAdmin();

        $countQueries = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson(self::URL)->assertOk();
            $count = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $count;
        };

        $this->seedMembersPerStatus();
        $few = $countQueries();

        for ($i = 1; $i <= 8; $i++) {
            $member = $this->member("Tambahan {$i}");
            $this->membership($member, $i % 2 ? 'active' : 'expired', [
                'membership_plan_id' => MembershipPlan::factory()->create()->id,
            ]);
        }
        $many = $countQueries();

        $this->assertSame($few, $many);
    }

    public function test_invalid_query_returns_422(): void
    {
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?status=rejected')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Status harus salah satu dari: active, pending, expired, none.']);

        $this->getJson(self::URL.'?membership_plan_id=999')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['membership_plan_id' => 'Paket membership tidak ditemukan.']);

        $this->getJson(self::URL.'?page=0')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['page']);
    }

    public function test_member_gets_403(): void
    {
        Sanctum::actingAs($this->member('Member Biasa'));

        $this->getJson(self::URL)->assertForbidden();
    }

    public function test_guest_gets_401(): void
    {
        $this->getJson(self::URL)
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);
    }
}
