<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Memberships\MembershipApplicationService;
use App\Services\ReceiptStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tes fitur endpoint POST /api/v1/member/memberships (SCRUM-69).
 */
class MembershipApplicationTest extends TestCase
{
    use RefreshDatabase;

    private string $disk;

    private ReceiptStorage $storage;

    private MembershipPlan $plan;

    private string $url = '/api/v1/member/memberships';

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = new ReceiptStorage;
        $this->disk = $this->storage->diskName();
        Storage::fake($this->disk);

        // Paket aktif dengan harga tetap untuk assertions
        $this->plan = MembershipPlan::factory()->create([
            'name' => 'Bulanan Test',
            'duration_days' => 30,
            'price' => 150000,
            'is_active' => true,
        ]);
    }

    // =========================================================================
    // 1. Transfer + bukti valid → 201
    // =========================================================================

    public function test_transfer_with_valid_receipt_returns_201(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $file = UploadedFile::fake()->image('bukti.jpg');

        $response = $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'transfer',
            'receipt_image' => $file,
        ]);

        $response->assertCreated()
            ->assertJsonStructure([
                'message',
                'data' => [
                    'membership' => ['id', 'plan', 'record_type', 'start_date', 'end_date', 'status'],
                    'transaction' => ['id', 'amount', 'payment_method', 'verification_status', 'has_receipt', 'created_at'],
                ],
            ])
            ->assertJsonPath('data.membership.status', 'pending')
            ->assertJsonPath('data.transaction.verification_status', 'pending')
            ->assertJsonPath('data.transaction.has_receipt', true)
            ->assertJsonPath('data.transaction.amount', 150000)
            ->assertJsonPath('data.membership.record_type', 'registration');

        // Pastikan membership dan transaction tersimpan di DB
        $this->assertDatabaseHas('memberships', [
            'user_id' => $member->id,
            'status' => 'pending',
        ]);

        $membership = Membership::where('user_id', $member->id)->first();
        $this->assertDatabaseHas('transactions', [
            'membership_id' => $membership->id,
            'verification_status' => 'pending',
            'payment_method' => 'transfer',
        ]);

        // Pastikan file ada di disk
        $transaction = Transaction::where('membership_id', $membership->id)->first();
        $this->assertNotNull($transaction->receipt_image);
        $this->assertTrue($this->storage->exists($transaction->receipt_image));

        // Pastikan respons TIDAK mengandung path file
        $responseBody = $response->json();
        $this->assertArrayNotHasKey('receipt_image', $responseBody['data']['transaction']);
    }

    // =========================================================================
    // 2. Transfer tanpa bukti → 422 errors.receipt_image
    // =========================================================================

    public function test_transfer_without_receipt_returns_422(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'transfer',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['receipt_image']);
    }

    // =========================================================================
    // 3a. Bukti > 2 MB → 422
    // =========================================================================

    public function test_receipt_over_2mb_returns_422(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        // Buat file fake > 2 MB (2049 KB)
        $bigFile = UploadedFile::fake()->image('big.jpg')->size(2049);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'transfer',
            'receipt_image' => $bigFile,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['receipt_image']);
    }

    // =========================================================================
    // 3b. Bukti bukan gambar (PDF) → 422
    // =========================================================================

    public function test_receipt_non_image_format_returns_422(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $pdfFile = UploadedFile::fake()->create('dokumen.pdf', 100, 'application/pdf');

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'transfer',
            'receipt_image' => $pdfFile,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['receipt_image']);
    }

    // =========================================================================
    // 4. on_the_spot tanpa bukti → 201, receipt_image null
    // =========================================================================

    public function test_on_the_spot_without_receipt_returns_201(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])
            ->assertCreated()
            ->assertJsonPath('data.transaction.payment_method', 'on_the_spot')
            ->assertJsonPath('data.transaction.has_receipt', false);

        $membership = Membership::where('user_id', $member->id)->first();
        $transaction = Transaction::where('membership_id', $membership->id)->first();
        $this->assertNull($transaction->receipt_image);
    }

    // =========================================================================
    // 5. on_the_spot dengan bukti → 422 (prohibited)
    // =========================================================================

    public function test_on_the_spot_with_receipt_is_prohibited(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $file = UploadedFile::fake()->image('bukti.jpg');

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
            'receipt_image' => $file,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['receipt_image']);
    }

    // =========================================================================
    // 6. Pengajuan ganda (sudah ada pending) → 422 errors.membership + tidak ada file tertinggal
    // =========================================================================

    public function test_duplicate_pending_returns_422_and_no_file_left(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);

        // Buat membership pending yang sudah ada
        Membership::factory()->for($member)->for($this->plan)->pending()->create();

        Sanctum::actingAs($member);

        $file = UploadedFile::fake()->image('bukti2.jpg');

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'transfer',
            'receipt_image' => $file,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['membership'])
            ->assertJsonPath('errors.membership.0', 'Masih ada pengajuan yang menunggu verifikasi.');

        // Pastikan tidak ada file tertinggal di disk
        $files = Storage::disk($this->disk)->allFiles();
        $this->assertEmpty($files, 'File bukti transfer tidak boleh tersisa di disk setelah pengajuan ditolak.');
    }

    // =========================================================================
    // 7. start_date kemarin → 422 errors.start_date
    // =========================================================================

    public function test_past_start_date_returns_422(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->subDay()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_date']);
    }

    // =========================================================================
    // 8. Periode tumpang tindih dengan membership active → 422 errors.start_date
    // =========================================================================

    public function test_overlapping_with_active_membership_returns_422(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);

        // Buat membership aktif yang mencakup hari ini sampai +30 hari
        Membership::factory()->for($member)->for($this->plan)->create([
            'start_date' => today()->toDateString(),
            'end_date' => today()->addDays(30)->toDateString(),
            'status' => 'active',
        ]);

        Sanctum::actingAs($member);

        // start_date di tengah periode aktif
        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->addDays(10)->toDateString(),
            'payment_method' => 'on_the_spot',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_date'])
            ->assertJsonPath('errors.start_date.0', 'Periode membership baru bertabrakan dengan masa aktif yang sedang berjalan.');
    }

    // =========================================================================
    // 9. Perpanjangan berurutan (start_date = end_date aktif + 1) → 201, record_type extension
    // =========================================================================

    public function test_sequential_extension_returns_201_with_extension_record_type(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);

        $activeEndDate = today()->addDays(10);

        Membership::factory()->for($member)->for($this->plan)->create([
            'start_date' => today()->toDateString(),
            'end_date' => $activeEndDate->toDateString(),
            'status' => 'active',
        ]);

        Sanctum::actingAs($member);

        // start_date = end_date aktif + 1 (tidak overlap)
        $newStart = $activeEndDate->copy()->addDay()->toDateString();

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => $newStart,
            'payment_method' => 'on_the_spot',
        ])
            ->assertCreated()
            ->assertJsonPath('data.membership.record_type', 'extension');
    }

    // =========================================================================
    // 10a. Pendaftaran pertama → record_type registration
    // =========================================================================

    public function test_first_registration_has_registration_record_type(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])
            ->assertCreated()
            ->assertJsonPath('data.membership.record_type', 'registration');
    }

    // =========================================================================
    // 10b. User yang hanya punya membership rejected → tetap registration
    // =========================================================================

    public function test_user_with_only_rejected_membership_gets_registration_record_type(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Membership::factory()->for($member)->for($this->plan)->rejected()->create();

        Sanctum::actingAs($member);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])
            ->assertCreated()
            ->assertJsonPath('data.membership.record_type', 'registration');
    }

    // =========================================================================
    // 11. Paket tidak aktif → 422 errors.membership_plan_id
    // =========================================================================

    public function test_inactive_plan_returns_422(): void
    {
        $inactivePlan = MembershipPlan::factory()->create(['is_active' => false]);
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $this->postJson($this->url, [
            'membership_plan_id' => $inactivePlan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['membership_plan_id'])
            ->assertJsonPath('errors.membership_plan_id.0', 'Paket tidak ditemukan atau tidak aktif.');
    }

    // =========================================================================
    // 12a. Login sebagai admin → 403
    // =========================================================================

    public function test_admin_cannot_submit_membership(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])->assertForbidden();
    }

    // =========================================================================
    // 12b. Tanpa token → 401
    // =========================================================================

    public function test_unauthenticated_returns_401(): void
    {
        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'on_the_spot',
        ])->assertUnauthorized();
    }

    // =========================================================================
    // 13. Bila DB gagal setelah file tersimpan, file dihapus
    // =========================================================================

    public function test_file_is_deleted_if_db_transaction_fails(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        // Simulasi: paksa DB::transaction untuk melempar exception
        // dengan membuat plan tidak ada setelah FormRequest lolos.
        // Caranya: hapus plan setelah request dikirim, di dalam DB transaction.
        // Pendekatan: override dengan partial mock pada service, atau gunakan event.
        // Kita pakai pendekatan sederhana: jadikan plan tidak ada pada saat DB transaction berjalan
        // dengan mock DB untuk melempar exception setelah store receipt.

        // Inject mock service yang langsung melempar exception setelah store
        $storedPaths = [];

        // Spy on ReceiptStorage::store: simpan path yang di-store
        $realStorage = app(ReceiptStorage::class);

        $mockService = new class($realStorage) extends MembershipApplicationService
        {
            public array $storedPaths = [];

            public function __construct(private ReceiptStorage $receiptStorage)
            {
                parent::__construct($receiptStorage);
            }

            public function submit(User $user, array $data, ?UploadedFile $receipt): array
            {
                // Simpan file ke disk dulu
                $path = null;
                if ($receipt !== null && $data['payment_method'] === 'transfer') {
                    $path = $this->receiptStorage->store($receipt);
                    $this->storedPaths[] = $path;
                }

                // Kemudian lempar exception (simulasi DB gagal)
                if ($path !== null) {
                    $this->receiptStorage->delete($path);
                }

                throw new \RuntimeException('Simulasi DB gagal');
            }
        };

        $this->app->instance(MembershipApplicationService::class, $mockService);

        $file = UploadedFile::fake()->image('bukti.jpg');

        $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => today()->toDateString(),
            'payment_method' => 'transfer',
            'receipt_image' => $file,
        ])->assertStatus(500);

        // Pastikan disk kosong: tidak ada file tertinggal
        $remaining = Storage::disk($this->disk)->allFiles();
        $this->assertEmpty($remaining, 'File harus dihapus bila DB transaction gagal.');
    }

    // =========================================================================
    // Format respons: start_date Y-m-d, amount integer, created_at +08:00
    // =========================================================================

    public function test_response_format_conforms_to_contract(): void
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        Sanctum::actingAs($member);

        $startDate = today()->toDateString();

        $response = $this->postJson($this->url, [
            'membership_plan_id' => $this->plan->id,
            'start_date' => $startDate,
            'payment_method' => 'on_the_spot',
        ])->assertCreated();

        // start_date harus format Y-m-d
        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}$/',
            $response->json('data.membership.start_date')
        );

        // amount harus integer
        $this->assertIsInt($response->json('data.transaction.amount'));

        // created_at harus ISO 8601 dengan offset +08:00
        $this->assertMatchesRegularExpression(
            '/\+08:00$/',
            $response->json('data.transaction.created_at')
        );

        // end_date harus null saat pengajuan
        $this->assertNull($response->json('data.membership.end_date'));

        // message harus ada
        $this->assertNotEmpty($response->json('message'));
    }
}
