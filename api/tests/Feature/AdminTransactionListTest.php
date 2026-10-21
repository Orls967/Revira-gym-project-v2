<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminTransactionListTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/admin/transactions';

    private function createAdmin(): User
    {
        return User::factory()->create(['role' => UserRole::Admin]);
    }

    private function createMember(): User
    {
        return User::factory()->create(['role' => UserRole::Member]);
    }

    private function createTransaction(array $attributes = [], array $membershipAttributes = [], ?User $user = null): Transaction
    {
        $user ??= User::factory()->create([
            'role' => UserRole::Member,
        ]);

        $plan = MembershipPlan::factory()->create([
            'name' => '1 Bulan Reguler',
            'duration_days' => 30,
            'price' => 150000.00,
        ]);

        $membership = Membership::factory()->create(array_merge([
            'user_id' => $user->id,
            'membership_plan_id' => $plan->id,
            'record_type' => 'registration',
            'start_date' => '2026-10-20',
            'status' => 'pending',
        ], $membershipAttributes));

        return Transaction::factory()->create(array_merge([
            'membership_id' => $membership->id,
            'user_id' => $user->id,
            'amount' => 150000.00,
            'payment_method' => 'transfer',
            'receipt_image' => 'receipts/struk_1.jpg',
            'verification_status' => 'pending',
            'verified_by' => null,
            'verified_at' => null,
            'reject_reason' => null,
        ], $attributes));
    }

    /**
     * 1. Admin tanpa filter query menghasilkan 200, hanya transaksi pending,
     * dan struktur item lengkap sesuai spesifikasi SCRUM-66.
     */
    public function test_admin_without_filter_returns_200_only_pending_with_complete_structure(): void
    {
        $admin = $this->createAdmin();
        $member = User::factory()->create([
            'name' => 'Siti Rahmah',
            'email' => 'siti@revira.test',
            'phone_number' => '081234567891',
            'role' => UserRole::Member,
        ]);

        $pending = $this->createTransaction(
            ['verification_status' => 'pending', 'payment_method' => 'transfer', 'amount' => 150000.00],
            ['record_type' => 'registration', 'start_date' => '2026-10-20'],
            $member
        );

        $this->createTransaction(['verification_status' => 'verified']);
        $this->createTransaction(['verification_status' => 'rejected', 'reject_reason' => 'Foto buram']);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL);

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'member' => ['id', 'name', 'email', 'phone_number'],
                        'plan' => ['id', 'name', 'duration_days'],
                        'record_type',
                        'start_date',
                        'amount',
                        'payment_method',
                        'verification_status',
                        'has_receipt',
                        'receipt_url',
                        'reject_reason',
                        'verified_at',
                        'created_at',
                    ],
                ],
                'links' => ['first', 'last', 'prev', 'next'],
                'meta' => ['current_page', 'from', 'last_page', 'links', 'path', 'per_page', 'to', 'total'],
            ]);

        $item = $response->json('data.0');
        $this->assertSame($pending->id, $item['id']);
        $this->assertSame($member->id, $item['member']['id']);
        $this->assertSame('Siti Rahmah', $item['member']['name']);
        $this->assertSame('siti@revira.test', $item['member']['email']);
        $this->assertSame('081234567891', $item['member']['phone_number']);
        $this->assertSame('1 Bulan Reguler', $item['plan']['name']);
        $this->assertSame(30, $item['plan']['duration_days']);
        $this->assertSame('registration', $item['record_type']);
        $this->assertSame('2026-10-20', $item['start_date']);
        $this->assertSame(150000, $item['amount']);
        $this->assertSame('transfer', $item['payment_method']);
        $this->assertSame('pending', $item['verification_status']);
        $this->assertTrue($item['has_receipt']);
        $this->assertSame("/api/v1/transactions/{$pending->id}/receipt", $item['receipt_url']);
        $this->assertNull($item['reject_reason']);
        $this->assertNull($item['verified_at']);
        $this->assertNotNull($item['created_at']);
    }

    /**
     * 2. Filter status:
     * - status=verified hanya menampilkan transaksi verified
     * - status=rejected hanya menampilkan rejected dengan reject_reason terisi
     */
    public function test_admin_filter_by_verified_and_rejected_status(): void
    {
        $admin = $this->createAdmin();

        $this->createTransaction(['verification_status' => 'pending']);
        $verified = $this->createTransaction([
            'verification_status' => 'verified',
            'verified_by' => $admin->id,
            'verified_at' => now(),
        ]);
        $rejected = $this->createTransaction([
            'verification_status' => 'rejected',
            'verified_by' => $admin->id,
            'verified_at' => now(),
            'reject_reason' => 'Nominal transfer tidak sesuai.',
        ]);

        Sanctum::actingAs($admin);

        // status=verified
        $responseVerified = $this->getJson(self::URL.'?status=verified');
        $responseVerified->assertOk()
            ->assertJsonCount(1, 'data');
        $this->assertSame($verified->id, $responseVerified->json('data.0.id'));
        $this->assertSame('verified', $responseVerified->json('data.0.verification_status'));

        // status=rejected
        $responseRejected = $this->getJson(self::URL.'?status=rejected');
        $responseRejected->assertOk()
            ->assertJsonCount(1, 'data');
        $this->assertSame($rejected->id, $responseRejected->json('data.0.id'));
        $this->assertSame('rejected', $responseRejected->json('data.0.verification_status'));
        $this->assertSame('Nominal transfer tidak sesuai.', $responseRejected->json('data.0.reject_reason'));
    }

    /**
     * Parameter status kosong (?status=) jatuh kembali ke default pending.
     * Transaksi verified dan rejected tidak ikut ditampilkan.
     */
    public function test_empty_status_falls_back_to_pending(): void
    {
        $admin = $this->createAdmin();
        $pending = $this->createTransaction(['verification_status' => 'pending']);
        $this->createTransaction(['verification_status' => 'verified']);
        $this->createTransaction(['verification_status' => 'rejected', 'reject_reason' => 'Foto buram']);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL.'?status=');

        $response->assertOk()
            ->assertJsonCount(1, 'data');
        $this->assertSame($pending->id, $response->json('data.0.id'));
        $this->assertSame('pending', $response->json('data.0.verification_status'));
    }

    /**
     * 3. Urutan pending: transaksi paling lama menunggu di atas (created_at asc, id asc).
     */
    public function test_pending_transactions_ordered_by_oldest_first(): void
    {
        $admin = $this->createAdmin();

        $baseTime = Carbon::parse('2026-10-18 10:00:00');

        $txOldest = $this->createTransaction([
            'verification_status' => 'pending',
            'created_at' => $baseTime->copy()->subHours(5),
        ]);
        $txNewest = $this->createTransaction([
            'verification_status' => 'pending',
            'created_at' => $baseTime->copy()->subHours(1),
        ]);
        $txMiddle = $this->createTransaction([
            'verification_status' => 'pending',
            'created_at' => $baseTime->copy()->subHours(3),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL);

        $response->assertOk();
        $ids = array_column($response->json('data'), 'id');
        $this->assertSame([$txOldest->id, $txMiddle->id, $txNewest->id], $ids);
    }

    /**
     * 4. Urutan verified: transaksi terbaru di atas (created_at desc, id desc).
     */
    public function test_verified_transactions_ordered_by_newest_first(): void
    {
        $admin = $this->createAdmin();

        $baseTime = Carbon::parse('2026-10-18 10:00:00');

        $txOldest = $this->createTransaction([
            'verification_status' => 'verified',
            'created_at' => $baseTime->copy()->subHours(5),
        ]);
        $txNewest = $this->createTransaction([
            'verification_status' => 'verified',
            'created_at' => $baseTime->copy()->subHours(1),
        ]);
        $txMiddle = $this->createTransaction([
            'verification_status' => 'verified',
            'created_at' => $baseTime->copy()->subHours(3),
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL.'?status=verified');

        $response->assertOk();
        $ids = array_column($response->json('data'), 'id');
        $this->assertSame([$txNewest->id, $txMiddle->id, $txOldest->id], $ids);
    }

    /**
     * 5. Paginasi: 16 transaksi pending -> halaman 1 berisi 15 (meta total 16, per_page 15),
     * halaman 2 berisi 1 transaksi.
     */
    public function test_pagination_returns_15_per_page_and_handles_page_2(): void
    {
        $admin = $this->createAdmin();

        for ($i = 0; $i < 16; $i++) {
            $this->createTransaction([
                'verification_status' => 'pending',
                'created_at' => now()->addMinutes($i),
            ]);
        }

        Sanctum::actingAs($admin);

        // Halaman 1
        $resPage1 = $this->getJson(self::URL);
        $resPage1->assertOk()
            ->assertJsonCount(15, 'data');
        $this->assertSame(1, $resPage1->json('meta.current_page'));
        $this->assertSame(15, $resPage1->json('meta.per_page'));
        $this->assertSame(16, $resPage1->json('meta.total'));
        $this->assertSame(2, $resPage1->json('meta.last_page'));

        // Halaman 2
        $resPage2 = $this->getJson(self::URL.'?page=2');
        $resPage2->assertOk()
            ->assertJsonCount(1, 'data');
        $this->assertSame(2, $resPage2->json('meta.current_page'));
        $this->assertSame(16, $resPage2->json('meta.total'));
    }

    /**
     * 6. receipt_url berisi /api/v1/transactions/{id}/receipt untuk transfer berbukti,
     * null untuk on_the_spot tanpa bukti; has_receipt sesuai boolean.
     */
    public function test_receipt_url_and_has_receipt_match_payment_method_and_image(): void
    {
        $admin = $this->createAdmin();

        $txTransfer = $this->createTransaction([
            'verification_status' => 'pending',
            'payment_method' => 'transfer',
            'receipt_image' => 'receipts/dummy_transfer.jpg',
        ]);

        $txOnTheSpot = $this->createTransaction([
            'verification_status' => 'pending',
            'payment_method' => 'on_the_spot',
            'receipt_image' => null,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL);
        $response->assertOk();

        $dataById = collect($response->json('data'))->keyBy('id');

        $this->assertTrue($dataById[$txTransfer->id]['has_receipt']);
        $this->assertSame("/api/v1/transactions/{$txTransfer->id}/receipt", $dataById[$txTransfer->id]['receipt_url']);

        $this->assertFalse($dataById[$txOnTheSpot->id]['has_receipt']);
        $this->assertNull($dataById[$txOnTheSpot->id]['receipt_url']);
    }

    /**
     * 7. Respons tidak pernah mengekspos path internal file storage receipt_image.
     */
    public function test_response_does_not_leak_receipt_image_internal_path(): void
    {
        $admin = $this->createAdmin();

        $secretPath = 'receipts/secret_internal_receipt_path_xyz789.png';
        $this->createTransaction([
            'verification_status' => 'pending',
            'receipt_image' => $secretPath,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL);
        $response->assertOk();

        $response->assertJsonMissing(['receipt_image' => $secretPath]);
        $this->assertStringNotContainsString('receipts/', $response->getContent());
        $this->assertStringNotContainsString('secret_internal_receipt_path_xyz789.png', $response->getContent());
    }

    /**
     * 8. amount dicast menjadi integer murni di JSON response.
     */
    public function test_amount_is_cast_to_integer(): void
    {
        $admin = $this->createAdmin();

        $this->createTransaction([
            'verification_status' => 'pending',
            'amount' => 150000.00,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL);
        $response->assertOk();

        $amount = $response->json('data.0.amount');
        $this->assertSame(150000, $amount);
        $this->assertIsInt($amount);
    }

    /**
     * 9. Parameter status tidak valid (?status=abc) ditolak dengan status 422 di field status.
     */
    public function test_invalid_status_is_rejected(): void
    {
        $admin = $this->createAdmin();

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::URL.'?status=abc');

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['status'])
            ->assertJsonFragment([
                'status' => ['Status harus salah satu dari: pending, verified, rejected.'],
            ]);
    }

    /**
     * 10. Akses ditolak:
     * - Tanpa token -> 401 Unauthenticated.
     * - Role member -> 403 Forbidden.
     */
    public function test_unauthenticated_and_forbidden_roles(): void
    {
        // 401 jika tamu
        $this->getJson(self::URL)
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        // 403 jika login sebagai member
        $member = $this->createMember();
        Sanctum::actingAs($member);

        $this->getJson(self::URL)
            ->assertForbidden()
            ->assertJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);
    }

    /**
     * 11. Tidak ada N+1: pemanggilan endpoint dengan 5 vs 15 transaksi memiliki jumlah query yang sama,
     * serta Model::preventLazyLoading aktif tanpa pelanggaran.
     */
    public function test_no_n_plus_one_queries_on_transaction_listing(): void
    {
        Model::preventLazyLoading();

        $admin = $this->createAdmin();
        Sanctum::actingAs($admin);

        // Buat 5 transaksi
        for ($i = 0; $i < 5; $i++) {
            $this->createTransaction(['verification_status' => 'pending']);
        }

        DB::flushQueryLog();
        DB::enableQueryLog();

        $res5 = $this->getJson(self::URL);
        $res5->assertOk()->assertJsonCount(5, 'data');
        $queryCount5 = count(DB::getQueryLog());

        // Tambah 10 transaksi lagi (total 15 di page 1)
        for ($i = 0; $i < 10; $i++) {
            $this->createTransaction(['verification_status' => 'pending']);
        }

        DB::flushQueryLog();

        $res15 = $this->getJson(self::URL);
        $res15->assertOk()->assertJsonCount(15, 'data');
        $queryCount15 = count(DB::getQueryLog());

        $this->assertSame($queryCount5, $queryCount15);
    }
}
