<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminTransactionDecisionTest extends TestCase
{
    use RefreshDatabase;

    private string $receiptsDisk;

    protected function setUp(): void
    {
        parent::setUp();

        $this->receiptsDisk = config('filesystems.receipts_disk', 'receipts');
        Storage::fake($this->receiptsDisk);

        // Kunci waktu acuan uji di zona waktu aplikasi (Asia/Makassar)
        Carbon::setTestNow(Carbon::parse('2026-10-20 10:00:00', 'Asia/Makassar'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function createAdmin(): User
    {
        return User::factory()->create(['role' => UserRole::Admin]);
    }

    private function createMember(): User
    {
        return User::factory()->create(['role' => UserRole::Member]);
    }

    /**
     * Membuat data uji transaksi dan membership dengan konfigurasi fleksibel.
     */
    private function createTransaction(
        array $planAttributes = [],
        array $membershipAttributes = [],
        array $transactionAttributes = [],
        ?User $user = null
    ): Transaction {
        $user ??= $this->createMember();

        $plan = MembershipPlan::factory()->create(array_merge([
            'name' => '1 Bulan Reguler',
            'duration_days' => 30,
            'price' => 150000.00,
        ], $planAttributes));

        $membership = Membership::factory()->create(array_merge([
            'user_id' => $user->id,
            'membership_plan_id' => $plan->id,
            'record_type' => 'registration',
            'status' => 'pending',
            'start_date' => Carbon::today('Asia/Makassar')->addDay()->toDateString(),
            'end_date' => null,
        ], $membershipAttributes));

        $receiptPath = 'receipts/struk_test_'.$membership->id.'.jpg';
        Storage::disk($this->receiptsDisk)->put($receiptPath, 'fake-receipt-content');

        return Transaction::factory()->create(array_merge([
            'membership_id' => $membership->id,
            'user_id' => $user->id,
            'amount' => $plan->price,
            'payment_method' => 'transfer',
            'receipt_image' => $receiptPath,
            'verification_status' => 'pending',
            'verified_by' => null,
            'verified_at' => null,
            'reject_reason' => null,
        ], $transactionAttributes));
    }

    /**
     * 1. Approve normal (start_date besok): 200; transaksi verified + verified_by + verified_at;
     * membership active, start tetap, end = start + durasi - 1.
     */
    public function test_admin_can_approve_normal_transaction_with_future_start_date(): void
    {
        $admin = $this->createAdmin();
        $tomorrow = Carbon::today('Asia/Makassar')->addDay()->toDateString(); // 2026-10-21
        $expectedEnd = Carbon::parse($tomorrow, 'Asia/Makassar')->addDays(29)->toDateString(); // 2026-11-19

        $transaction = $this->createTransaction(
            ['duration_days' => 30],
            ['start_date' => $tomorrow]
        );

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/v1/admin/transactions/{$transaction->id}/approve");

        $response->assertOk()
            ->assertJson([
                'message' => 'Transaksi disetujui. Membership member sudah aktif.',
                'data' => [
                    'transaction' => [
                        'id' => $transaction->id,
                        'verification_status' => 'verified',
                        'reject_reason' => null,
                    ],
                    'membership' => [
                        'id' => $transaction->membership_id,
                        'status' => 'active',
                        'record_type' => 'registration',
                        'start_date' => $tomorrow,
                        'end_date' => $expectedEnd,
                    ],
                ],
            ]);

        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'verification_status' => 'verified',
            'verified_by' => $admin->id,
            'reject_reason' => null,
        ]);

        $this->assertDatabaseHas('memberships', [
            'id' => $transaction->membership_id,
            'status' => 'active',
        ]);

        $freshMembership = $transaction->membership()->firstOrFail();
        $this->assertSame($tomorrow, $freshMembership->start_date?->toDateString());
        $this->assertSame($expectedEnd, $freshMembership->end_date?->toDateString());
    }

    /**
     * 2. Approve start_date lampau: start jadi hari ini, end dihitung dari hari ini.
     */
    public function test_admin_approving_past_start_date_resets_start_to_today(): void
    {
        $admin = $this->createAdmin();
        $pastDate = Carbon::today('Asia/Makassar')->subDays(5)->toDateString(); // 2026-10-15
        $today = Carbon::today('Asia/Makassar')->toDateString(); // 2026-10-20
        $expectedEnd = Carbon::parse($today, 'Asia/Makassar')->addDays(29)->toDateString(); // 2026-11-18

        $transaction = $this->createTransaction(
            ['duration_days' => 30],
            ['start_date' => $pastDate]
        );

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/v1/admin/transactions/{$transaction->id}/approve");

        $response->assertOk()
            ->assertJson([
                'message' => 'Transaksi disetujui. Membership member sudah aktif.',
                'data' => [
                    'transaction' => [
                        'id' => $transaction->id,
                        'verification_status' => 'verified',
                    ],
                    'membership' => [
                        'id' => $transaction->membership_id,
                        'status' => 'active',
                        'start_date' => $today,
                        'end_date' => $expectedEnd,
                    ],
                ],
            ]);

        $this->assertDatabaseHas('memberships', [
            'id' => $transaction->membership_id,
            'status' => 'active',
        ]);

        $freshMembership = $transaction->membership()->firstOrFail();
        $this->assertSame($today, $freshMembership->start_date?->toDateString());
        $this->assertSame($expectedEnd, $freshMembership->end_date?->toDateString());
    }

    /**
     * 3. end_date untuk paket 30 hari dan paket 1 hari (end = start).
     */
    public function test_end_date_calculation_for_1_day_and_30_day_plans(): void
    {
        $admin = $this->createAdmin();
        $today = Carbon::today('Asia/Makassar')->toDateString();

        // Paket 1 hari
        $tx1Day = $this->createTransaction(
            ['duration_days' => 1],
            ['start_date' => $today]
        );

        Sanctum::actingAs($admin);

        $resp1Day = $this->postJson("/api/v1/admin/transactions/{$tx1Day->id}/approve");
        $resp1Day->assertOk()
            ->assertJson([
                'data' => [
                    'membership' => [
                        'start_date' => $today,
                        'end_date' => $today,
                    ],
                ],
            ]);

        // Paket 30 hari
        $tx30Day = $this->createTransaction(
            ['duration_days' => 30],
            ['start_date' => $today]
        );

        $resp30Day = $this->postJson("/api/v1/admin/transactions/{$tx30Day->id}/approve");
        $resp30Day->assertOk()
            ->assertJson([
                'data' => [
                    'membership' => [
                        'start_date' => $today,
                        'end_date' => Carbon::parse($today)->addDays(29)->toDateString(),
                    ],
                ],
            ]);
    }

    /**
     * 4. Reject tanpa reject_reason -> 422 errors.reject_reason; 256 karakter -> 422; hanya spasi -> 422.
     */
    public function test_reject_validation_rules(): void
    {
        $admin = $this->createAdmin();
        $transaction = $this->createTransaction();

        Sanctum::actingAs($admin);

        // a. Tanpa reject_reason
        $respEmpty = $this->postJson("/api/v1/admin/transactions/{$transaction->id}/reject", []);
        $respEmpty->assertStatus(422)
            ->assertJsonValidationErrors(['reject_reason'])
            ->assertJsonPath('errors.reject_reason.0', 'Alasan penolakan wajib diisi.');

        // b. 256 karakter (maks 255)
        $respTooLong = $this->postJson("/api/v1/admin/transactions/{$transaction->id}/reject", [
            'reject_reason' => str_repeat('a', 256),
        ]);
        $respTooLong->assertStatus(422)
            ->assertJsonValidationErrors(['reject_reason'])
            ->assertJsonPath('errors.reject_reason.0', 'Alasan penolakan maksimal 255 karakter.');

        // c. Hanya spasi
        $respWhitespace = $this->postJson("/api/v1/admin/transactions/{$transaction->id}/reject", [
            'reject_reason' => '     ',
        ]);
        $respWhitespace->assertStatus(422)
            ->assertJsonValidationErrors(['reject_reason'])
            ->assertJsonPath('errors.reject_reason.0', 'Alasan penolakan wajib diisi.');
    }

    /**
     * 5. Reject dengan alasan: 200; transaksi rejected + reject_reason + verified_by + verified_at;
     * membership rejected, end_date null; file bukti masih ada.
     */
    public function test_admin_can_reject_transaction_with_reason(): void
    {
        $admin = $this->createAdmin();
        $transaction = $this->createTransaction();
        $reason = 'Nominal transfer tidak sesuai dengan harga paket.';

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/v1/admin/transactions/{$transaction->id}/reject", [
            'reject_reason' => $reason,
        ]);

        $response->assertOk()
            ->assertJson([
                'message' => 'Transaksi ditolak.',
                'data' => [
                    'transaction' => [
                        'id' => $transaction->id,
                        'verification_status' => 'rejected',
                        'reject_reason' => $reason,
                    ],
                    'membership' => [
                        'id' => $transaction->membership_id,
                        'status' => 'rejected',
                        'end_date' => null,
                    ],
                ],
            ]);

        $this->assertDatabaseHas('transactions', [
            'id' => $transaction->id,
            'verification_status' => 'rejected',
            'reject_reason' => $reason,
            'verified_by' => $admin->id,
        ]);

        $this->assertDatabaseHas('memberships', [
            'id' => $transaction->membership_id,
            'status' => 'rejected',
            'end_date' => null,
        ]);

        // File bukti transfer tidak dihapus
        Storage::disk($this->receiptsDisk)->assertExists($transaction->receipt_image);
    }

    /**
     * 6. Proses ulang transaksi verified -> 409; transaksi rejected -> 409 (approve dan reject).
     */
    public function test_reprocessing_already_verified_or_rejected_transaction_returns_409(): void
    {
        $admin = $this->createAdmin();

        $verifiedTx = $this->createTransaction([], [], [
            'verification_status' => 'verified',
            'verified_by' => $admin->id,
            'verified_at' => now(),
        ]);

        $rejectedTx = $this->createTransaction([], [], [
            'verification_status' => 'rejected',
            'verified_by' => $admin->id,
            'verified_at' => now(),
            'reject_reason' => 'Sudah ditolak sebelumnya.',
        ]);

        Sanctum::actingAs($admin);

        // Verified coba di-approve lagi
        $this->postJson("/api/v1/admin/transactions/{$verifiedTx->id}/approve")
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Transaksi ini sudah diproses (status: verified).',
            ]);

        // Verified coba di-reject
        $this->postJson("/api/v1/admin/transactions/{$verifiedTx->id}/reject", [
            'reject_reason' => 'Coba tolak lagi',
        ])
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Transaksi ini sudah diproses (status: verified).',
            ]);

        // Rejected coba di-approve
        $this->postJson("/api/v1/admin/transactions/{$rejectedTx->id}/approve")
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Transaksi ini sudah diproses (status: rejected).',
            ]);

        // Rejected coba di-reject lagi
        $this->postJson("/api/v1/admin/transactions/{$rejectedTx->id}/reject", [
            'reject_reason' => 'Coba tolak ulang',
        ])
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Transaksi ini sudah diproses (status: rejected).',
            ]);
    }

    /**
     * 7. Tumpang tindih dengan membership active lain -> approve 409, data tidak berubah (transaksi dan membership tetap pending).
     */
    public function test_approve_fails_with_409_when_overlapping_with_another_active_membership(): void
    {
        $admin = $this->createAdmin();
        $member = $this->createMember();

        // Membership aktif lain milik user ini: 2026-10-15 sampai 2026-11-14
        Membership::factory()->create([
            'user_id' => $member->id,
            'status' => 'active',
            'start_date' => '2026-10-15',
            'end_date' => '2026-11-14',
        ]);

        // Transaksi pending untuk user yang sama dengan tanggal mulai tumpang tindih (2026-11-01)
        $pendingTx = $this->createTransaction(
            ['duration_days' => 30],
            ['start_date' => '2026-11-01', 'status' => 'pending'],
            ['verification_status' => 'pending'],
            $member
        );

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/v1/admin/transactions/{$pendingTx->id}/approve");

        $response->assertStatus(409)
            ->assertExactJson([
                'message' => 'Periode membership bertabrakan dengan masa aktif lain milik member ini.',
            ]);

        // Data tidak berubah
        $this->assertDatabaseHas('transactions', [
            'id' => $pendingTx->id,
            'verification_status' => 'pending',
            'verified_by' => null,
        ]);

        $this->assertDatabaseHas('memberships', [
            'id' => $pendingTx->membership_id,
            'status' => 'pending',
        ]);
    }

    /**
     * 8. Perpanjangan berurutan (start = end_date aktif + 1) -> approve 200.
     */
    public function test_sequential_extension_starting_day_after_active_end_date_succeeds(): void
    {
        $admin = $this->createAdmin();
        $member = $this->createMember();

        // Membership aktif sekarang: berakhir pada 2026-10-31
        Membership::factory()->create([
            'user_id' => $member->id,
            'status' => 'active',
            'start_date' => '2026-10-02',
            'end_date' => '2026-10-31',
        ]);

        // Perpanjangan: mulai tepat hari berikutnya (2026-11-01)
        $extensionTx = $this->createTransaction(
            ['duration_days' => 30],
            ['start_date' => '2026-11-01', 'record_type' => 'extension', 'status' => 'pending'],
            ['verification_status' => 'pending'],
            $member
        );

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/v1/admin/transactions/{$extensionTx->id}/approve");

        $response->assertOk()
            ->assertJson([
                'message' => 'Transaksi disetujui. Membership member sudah aktif.',
                'data' => [
                    'membership' => [
                        'status' => 'active',
                        'start_date' => '2026-11-01',
                        'end_date' => '2026-11-30',
                    ],
                ],
            ]);
    }

    /**
     * 9. Approve dengan start hari ini -> GET /api/v1/me sebagai member menunjukkan membership aktif.
     */
    public function test_approved_membership_starting_today_shows_active_in_me_endpoint(): void
    {
        $admin = $this->createAdmin();
        $member = $this->createMember();
        $today = Carbon::today('Asia/Makassar')->toDateString();

        $tx = $this->createTransaction(
            ['duration_days' => 30],
            ['start_date' => $today, 'status' => 'pending'],
            ['verification_status' => 'pending'],
            $member
        );

        Sanctum::actingAs($admin);
        $this->postJson("/api/v1/admin/transactions/{$tx->id}/approve")->assertOk();

        // Login sebagai member dan periksa profil /me
        Sanctum::actingAs($member);

        $response = $this->getJson('/api/v1/me');

        $response->assertOk()
            ->assertJson([
                'data' => [
                    'id' => $member->id,
                    'role' => 'member',
                    'membership' => [
                        'is_active' => true,
                        'status' => 'active',
                        'start_date' => $today,
                        'end_date' => Carbon::parse($today)->addDays(29)->toDateString(),
                    ],
                ],
            ]);
    }

    /**
     * 10. Transaksi tidak ada -> 404.
     */
    public function test_approve_and_reject_non_existent_transaction_returns_404(): void
    {
        $admin = $this->createAdmin();
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/transactions/999999/approve')
            ->assertStatus(404)
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);

        $this->postJson('/api/v1/admin/transactions/999999/reject', [
            'reject_reason' => 'Alasan penolakan',
        ])
            ->assertStatus(404)
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    /**
     * 11. Member -> 403; tanpa token -> 401 (approve dan reject).
     */
    public function test_authorization_member_returns_403_and_unauthenticated_returns_401(): void
    {
        $member = $this->createMember();
        $transaction = $this->createTransaction();

        // a. Member login -> 403
        Sanctum::actingAs($member);

        $this->postJson("/api/v1/admin/transactions/{$transaction->id}/approve")
            ->assertStatus(403)
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);

        $this->postJson("/api/v1/admin/transactions/{$transaction->id}/reject", [
            'reject_reason' => 'Ditolak oleh member',
        ])
            ->assertStatus(403)
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);

        // b. Tanpa token (guest) -> 401
        // Reset autentikasi Sanctum
        app('auth')->forgetGuards();

        $this->postJson("/api/v1/admin/transactions/{$transaction->id}/approve")
            ->assertStatus(401)
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->postJson("/api/v1/admin/transactions/{$transaction->id}/reject", [
            'reject_reason' => 'Ditolak tanpa token',
        ])
            ->assertStatus(401)
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }
}
