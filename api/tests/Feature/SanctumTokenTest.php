<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\ApiTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SanctumTokenTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Memastikan route berlindung auth:sanctum bisa diakses dengan Bearer token valid.
     */
    public function test_protected_route_accepts_valid_bearer_token(): void
    {
        $user = User::factory()->create();
        $token = app(ApiTokenService::class)->createToken($user, ApiTokenService::DEVICE_MOBILE);

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertOk()
            ->assertJson(['id' => $user->id, 'email' => $user->email]);
    }

    /**
     * Memastikan request tanpa token ditolak dengan 401 JSON.
     */
    public function test_protected_route_rejects_request_without_token(): void
    {
        $this->get('/api/v1/user')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Memastikan request dengan token salah ditolak dengan 401 JSON.
     */
    public function test_protected_route_rejects_invalid_token(): void
    {
        $this->withToken('1|token-salah')
            ->get('/api/v1/user')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Memastikan nama token diisi dari device_name klien.
     */
    public function test_token_name_uses_device_name(): void
    {
        $user = User::factory()->create();

        app(ApiTokenService::class)->createToken($user, ApiTokenService::DEVICE_ADMIN_WEB);

        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'name' => 'admin-web',
        ]);
    }

    /**
     * Memastikan token yang sudah dicabut tidak bisa dipakai lagi.
     */
    public function test_revoked_token_is_rejected(): void
    {
        $user = User::factory()->create();
        $service = app(ApiTokenService::class);
        $token = $service->createToken($user, ApiTokenService::DEVICE_MOBILE);

        $user->withAccessToken($token->accessToken);
        $service->revokeCurrentToken($user);

        $this->assertDatabaseCount('personal_access_tokens', 0);

        $this->withToken($token->plainTextToken)
            ->getJson('/api/v1/user')
            ->assertUnauthorized();
    }

    /**
     * Memastikan semua token user bisa dicabut sekaligus.
     */
    public function test_all_tokens_can_be_revoked(): void
    {
        $user = User::factory()->create();
        $service = app(ApiTokenService::class);
        $service->createToken($user, ApiTokenService::DEVICE_MOBILE);
        $service->createToken($user, ApiTokenService::DEVICE_ADMIN_WEB);

        $service->revokeAllTokens($user);

        $this->assertSame(0, $user->tokens()->count());
    }
}
