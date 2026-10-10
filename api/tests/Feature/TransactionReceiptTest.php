<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Services\ReceiptStorage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionReceiptTest extends TestCase
{
    use RefreshDatabase;

    private string $disk;

    private ReceiptStorage $storage;

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = new ReceiptStorage;
        $this->disk = $this->storage->diskName();
        Storage::fake($this->disk);
    }

    private function createMemberWithTransaction(?string $receiptPath = null): array
    {
        $member = User::factory()->create(['role' => UserRole::Member]);
        $plan = MembershipPlan::factory()->create();
        $membership = Membership::factory()->for($member)->for($plan)->create();

        $transaction = Transaction::factory()->create([
            'user_id' => $member->id,
            'membership_id' => $membership->id,
            'payment_method' => 'transfer',
            'receipt_image' => $receiptPath,
            'verification_status' => 'pending',
        ]);

        return [$member, $transaction];
    }

    public function test_guest_cannot_access_receipt_endpoint(): void
    {
        [, $transaction] = $this->createMemberWithTransaction('receipts/dummy.jpg');

        $this->getJson("/api/v1/transactions/{$transaction->id}/receipt")
            ->assertUnauthorized();
    }

    public function test_other_member_cannot_view_another_members_receipt(): void
    {
        [$owner, $transaction] = $this->createMemberWithTransaction('receipts/test.jpg');
        $otherMember = User::factory()->create(['role' => UserRole::Member]);

        Storage::disk($this->disk)->put('receipts/test.jpg', 'dummy image content');

        Sanctum::actingAs($otherMember);

        $this->getJson("/api/v1/transactions/{$transaction->id}/receipt")
            ->assertForbidden()
            ->assertJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);
    }

    public function test_owner_member_can_view_own_transaction_receipt(): void
    {
        $file = UploadedFile::fake()->image('struk_asli.jpg');
        $path = $this->storage->store($file);

        [$owner, $transaction] = $this->createMemberWithTransaction($path);

        Sanctum::actingAs($owner);

        $response = $this->get("/api/v1/transactions/{$transaction->id}/receipt");

        $response->assertOk();
        $this->assertStringContainsString('image/jpeg', $response->headers->get('content-type', ''));
    }

    public function test_admin_can_view_any_member_transaction_receipt(): void
    {
        $file = UploadedFile::fake()->image('struk_member.png');
        $path = $this->storage->store($file);

        [$owner, $transaction] = $this->createMemberWithTransaction($path);
        $admin = User::factory()->create(['role' => UserRole::Admin]);

        Sanctum::actingAs($admin);

        $response = $this->get("/api/v1/transactions/{$transaction->id}/receipt");

        $response->assertOk();
        $this->assertStringContainsString('image/png', $response->headers->get('content-type', ''));
    }

    public function test_receipt_endpoint_sets_content_type_from_content_and_security_headers(): void
    {
        $file = UploadedFile::fake()->image('struk.webp', 400, 400);
        $path = $this->storage->store($file);

        [$owner, $transaction] = $this->createMemberWithTransaction($path);

        Sanctum::actingAs($owner);

        $response = $this->get("/api/v1/transactions/{$transaction->id}/receipt");

        $response->assertOk();
        $this->assertStringContainsString('image/webp', $response->headers->get('content-type', ''));
        $this->assertSame('nosniff', $response->headers->get('x-content-type-options'));
        $this->assertStringContainsString('private', $response->headers->get('cache-control', ''));
        $this->assertStringContainsString('no-store', $response->headers->get('cache-control', ''));
    }

    public function test_returns_404_when_receipt_is_null_or_file_missing(): void
    {
        [$owner, $transaction] = $this->createMemberWithTransaction(null);

        Sanctum::actingAs($owner);

        $this->getJson("/api/v1/transactions/{$transaction->id}/receipt")
            ->assertNotFound()
            ->assertJson(['message' => 'Bukti transfer tidak ditemukan.']);

        // Kasus: path ada di DB tetapi file terhapus di storage
        $transaction->update(['receipt_image' => 'receipts/deleted.jpg']);
        $this->getJson("/api/v1/transactions/{$transaction->id}/receipt")
            ->assertNotFound();
    }

    public function test_seeder_dummy_receipt_accessible_via_authenticated_endpoint(): void
    {
        $this->seed();

        $pendingTx = Transaction::where('verification_status', 'pending')->first();
        $this->assertNotNull($pendingTx);
        $this->assertNotNull($pendingTx->receipt_image);

        // Bukti transfer dummy disalin seeder ke receipts disk
        $this->assertTrue($this->storage->exists($pendingTx->receipt_image));

        // Akses oleh admin
        $admin = User::where('role', UserRole::Admin)->first();
        Sanctum::actingAs($admin);

        $resAdmin = $this->get("/api/v1/transactions/{$pendingTx->id}/receipt");
        $resAdmin->assertOk();

        // Akses oleh member pemilik transaksi
        $owner = User::find($pendingTx->user_id);
        Sanctum::actingAs($owner);

        $resOwner = $this->get("/api/v1/transactions/{$pendingTx->id}/receipt");
        $resOwner->assertOk();
    }

    public function test_admin_accessing_transaction_with_traversal_receipt_image_returns_404(): void
    {
        [$owner, $transaction] = $this->createMemberWithTransaction('../.env');
        $admin = User::factory()->create(['role' => UserRole::Admin]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/v1/transactions/{$transaction->id}/receipt")
            ->assertNotFound()
            ->assertJson(['message' => 'Bukti transfer tidak ditemukan.']);
    }
}
