<?php

namespace Tests\Feature;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminMembershipPlanTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_admin_membership_plans(): void
    {
        $this->getJson('/api/v1/admin/membership-plans')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->postJson('/api/v1/admin/membership-plans', [])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->getJson('/api/v1/admin/membership-plans/1')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->putJson('/api/v1/admin/membership-plans/1', [])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);

        $this->deleteJson('/api/v1/admin/membership-plans/1')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    public function test_member_is_forbidden_from_admin_membership_plans(): void
    {
        $member = User::factory()->create();
        Sanctum::actingAs($member);

        $plan = MembershipPlan::factory()->create();

        $this->getJson('/api/v1/admin/membership-plans')
            ->assertForbidden()
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);

        $this->postJson('/api/v1/admin/membership-plans', [
            'name' => 'Paket Baru',
            'duration_days' => 30,
            'price' => 150000,
        ])
            ->assertForbidden()
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);

        $this->getJson("/api/v1/admin/membership-plans/{$plan->id}")
            ->assertForbidden()
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);

        $this->putJson("/api/v1/admin/membership-plans/{$plan->id}", ['name' => 'Update'])
            ->assertForbidden()
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);

        $this->deleteJson("/api/v1/admin/membership-plans/{$plan->id}")
            ->assertForbidden()
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);
    }

    public function test_admin_can_list_all_membership_plans_including_inactive(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        MembershipPlan::factory()->create(['name' => 'Paket Aktif', 'is_active' => true]);
        MembershipPlan::factory()->create(['name' => 'Paket Nonaktif', 'is_active' => false]);

        $response = $this->getJson('/api/v1/admin/membership-plans');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'name',
                        'duration_days',
                        'price',
                        'description',
                        'is_active',
                        'created_at',
                        'updated_at',
                    ],
                ],
            ]);

        $this->assertIsInt($response->json('data.0.price'));
        $this->assertIsInt($response->json('data.1.price'));
    }

    public function test_admin_can_create_membership_plan(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $payload = [
            'name' => 'Paket Bulanan',
            'duration_days' => 30,
            'price' => 150000,
            'description' => 'Akses gym 30 hari penuh',
            'is_active' => true,
        ];

        $response = $this->postJson('/api/v1/admin/membership-plans', $payload);

        $response->assertCreated()
            ->assertJson([
                'message' => 'Paket membership berhasil dibuat.',
                'data' => [
                    'name' => 'Paket Bulanan',
                    'duration_days' => 30,
                    'price' => 150000,
                    'description' => 'Akses gym 30 hari penuh',
                    'is_active' => true,
                ],
            ])
            ->assertJsonStructure([
                'message',
                'data' => [
                    'id',
                    'name',
                    'duration_days',
                    'price',
                    'description',
                    'is_active',
                    'created_at',
                    'updated_at',
                ],
            ]);

        $this->assertIsInt($response->json('data.price'));

        $this->assertDatabaseHas('membership_plans', [
            'name' => 'Paket Bulanan',
            'duration_days' => 30,
            'price' => 150000.00,
            'is_active' => 1,
        ]);
    }

    public function test_admin_can_create_membership_plan_without_is_active_defaults_to_true_boolean(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $payload = [
            'name' => 'Paket Default Aktif',
            'duration_days' => 30,
            'price' => 150000,
            'description' => 'Akses gym 30 hari tanpa is_active',
        ];

        $response = $this->postJson('/api/v1/admin/membership-plans', $payload);

        $response->assertCreated();

        $this->assertIsBool($response->json('data.is_active'));
        $this->assertTrue($response->json('data.is_active'));

        $this->assertDatabaseHas('membership_plans', [
            'name' => 'Paket Default Aktif',
            'duration_days' => 30,
            'price' => 150000.00,
            'is_active' => 1,
        ]);
    }

    public function test_create_membership_plan_validation_fails_with_invalid_data(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/membership-plans', []);

        $response->assertUnprocessable()
            ->assertJsonStructure(['message', 'errors'])
            ->assertJsonValidationErrors(['name', 'duration_days', 'price']);

        $responseInvalid = $this->postJson('/api/v1/admin/membership-plans', [
            'name' => str_repeat('a', 101),
            'duration_days' => 0,
            'price' => -100,
            'is_active' => 'not-a-bool',
        ]);

        $responseInvalid->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'duration_days', 'price', 'is_active']);

        // Uji batas maksimal harga (decimal(10,2) overflow pencegahan)
        $responseOverflow = $this->postJson('/api/v1/admin/membership-plans', [
            'name' => 'Paket Mahal',
            'duration_days' => 30,
            'price' => 100000000, // melebihi max:99999999
        ]);

        $responseOverflow->assertUnprocessable()
            ->assertJsonValidationErrors(['price']);
    }

    public function test_membership_plan_description_max_length_validation(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        // Store: 1001 karakter → 422
        $responseStoreInvalid = $this->postJson('/api/v1/admin/membership-plans', [
            'name' => 'Paket Test',
            'duration_days' => 30,
            'price' => 100000,
            'description' => str_repeat('a', 1001),
        ]);

        $responseStoreInvalid->assertUnprocessable()
            ->assertJsonValidationErrors(['description']);

        // Store: 1000 karakter → lolos (201)
        $responseStoreValid = $this->postJson('/api/v1/admin/membership-plans', [
            'name' => 'Paket 1000 Char',
            'duration_days' => 30,
            'price' => 100000,
            'description' => str_repeat('a', 1000),
        ]);

        $responseStoreValid->assertCreated();

        $plan = MembershipPlan::where('name', 'Paket 1000 Char')->firstOrFail();

        // Update: 1001 karakter → 422
        $responseUpdateInvalid = $this->putJson("/api/v1/admin/membership-plans/{$plan->id}", [
            'name' => 'Paket 1000 Char',
            'duration_days' => 30,
            'price' => 100000,
            'description' => str_repeat('b', 1001),
        ]);

        $responseUpdateInvalid->assertUnprocessable()
            ->assertJsonValidationErrors(['description']);

        // Update: 1000 karakter → lolos (200)
        $responseUpdateValid = $this->putJson("/api/v1/admin/membership-plans/{$plan->id}", [
            'name' => 'Paket 1000 Char',
            'duration_days' => 30,
            'price' => 100000,
            'description' => str_repeat('b', 1000),
        ]);

        $responseUpdateValid->assertOk();
    }

    public function test_admin_can_view_single_membership_plan(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $plan = MembershipPlan::factory()->create([
            'name' => 'Paket Khusus',
            'duration_days' => 60,
            'price' => 250000,
            'is_active' => true,
        ]);

        $response = $this->getJson("/api/v1/admin/membership-plans/{$plan->id}");

        $response->assertOk()
            ->assertJson([
                'data' => [
                    'id' => $plan->id,
                    'name' => 'Paket Khusus',
                    'duration_days' => 60,
                    'price' => 250000,
                    'is_active' => true,
                ],
            ]);

        $this->assertIsInt($response->json('data.price'));
    }

    public function test_view_membership_plan_returns_404_if_not_found(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/membership-plans/99999')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    public function test_admin_access_with_non_numeric_id_returns_404(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $resGet = $this->getJson('/api/v1/admin/membership-plans/abc');
        $resGet->assertNotFound();

        $resPut = $this->putJson('/api/v1/admin/membership-plans/abc', ['name' => 'Update']);
        $resPut->assertNotFound();

        $resDelete = $this->deleteJson('/api/v1/admin/membership-plans/abc');
        $resDelete->assertNotFound();
    }

    public function test_admin_access_with_overflow_id_returns_404(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $overflowId = '99999999999999999999';

        $resGet = $this->getJson("/api/v1/admin/membership-plans/{$overflowId}");
        $resGet->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);

        $resPut = $this->putJson("/api/v1/admin/membership-plans/{$overflowId}", [
            'name' => 'Update',
            'duration_days' => 30,
            'price' => 100000,
        ]);
        $resPut->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);

        $resDelete = $this->deleteJson("/api/v1/admin/membership-plans/{$overflowId}");
        $resDelete->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    public function test_admin_can_update_membership_plan(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $plan = MembershipPlan::factory()->create([
            'name' => 'Nama Lama',
            'duration_days' => 30,
            'price' => 100000,
            'is_active' => true,
        ]);

        $response = $this->putJson("/api/v1/admin/membership-plans/{$plan->id}", [
            'name' => 'Nama Baru',
            'duration_days' => 30,
            'price' => 120000,
            'is_active' => false,
        ]);

        $response->assertOk()
            ->assertJson([
                'message' => 'Paket membership berhasil diperbarui.',
                'data' => [
                    'id' => $plan->id,
                    'name' => 'Nama Baru',
                    'duration_days' => 30,
                    'price' => 120000,
                    'is_active' => false,
                ],
            ]);

        $this->assertIsInt($response->json('data.price'));

        $this->assertDatabaseHas('membership_plans', [
            'id' => $plan->id,
            'name' => 'Nama Baru',
            'duration_days' => 30,
            'price' => 120000.00,
            'is_active' => 0,
        ]);
    }

    public function test_update_membership_plan_requires_all_mandatory_fields(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $plan = MembershipPlan::factory()->create([
            'name' => 'Paket Asli',
            'duration_days' => 30,
            'price' => 100000,
        ]);

        // PUT hanya dengan price → 422 dengan error untuk name dan duration_days
        $responsePartial = $this->putJson("/api/v1/admin/membership-plans/{$plan->id}", [
            'price' => 150000,
        ]);

        $responsePartial->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'duration_days']);

        // PUT lengkap → 200 {message, data}
        $responseComplete = $this->putJson("/api/v1/admin/membership-plans/{$plan->id}", [
            'name' => 'Paket Lengkap Diperbarui',
            'duration_days' => 45,
            'price' => 200000,
        ]);

        $responseComplete->assertOk()
            ->assertJsonStructure(['message', 'data'])
            ->assertJson([
                'message' => 'Paket membership berhasil diperbarui.',
                'data' => [
                    'id' => $plan->id,
                    'name' => 'Paket Lengkap Diperbarui',
                    'duration_days' => 45,
                    'price' => 200000,
                ],
            ]);
    }

    public function test_update_membership_plan_returns_404_if_not_found(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/admin/membership-plans/99999', [
            'name' => 'Update',
            'duration_days' => 30,
            'price' => 100000,
        ])
            ->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    public function test_admin_can_delete_unused_membership_plan(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $plan = MembershipPlan::factory()->create();

        $response = $this->deleteJson("/api/v1/admin/membership-plans/{$plan->id}");

        $response->assertOk()
            ->assertExactJson(['message' => 'Paket membership berhasil dihapus.']);

        $this->assertDatabaseMissing('membership_plans', ['id' => $plan->id]);
    }

    public function test_delete_membership_plan_returns_404_if_not_found(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->deleteJson('/api/v1/admin/membership-plans/99999')
            ->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    public function test_admin_cannot_delete_used_membership_plan_returns_409(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $plan = MembershipPlan::factory()->create();
        Membership::factory()->create(['membership_plan_id' => $plan->id]);

        $response = $this->deleteJson("/api/v1/admin/membership-plans/{$plan->id}");

        $response->assertStatus(409)
            ->assertJson([
                'message' => 'Paket membership tidak dapat dihapus karena sudah pernah digunakan oleh member. Silakan nonaktifkan paket (is_active = false) sebagai alternatif.',
            ]);

        $this->assertDatabaseHas('membership_plans', ['id' => $plan->id]);
    }
}
