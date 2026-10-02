<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Memastikan request tanpa token ditolak dengan 401 JSON, bukan redirect.
     */
    public function test_request_without_token_returns_401(): void
    {
        $this->getJson('/api/v1/admin/ping')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Memastikan member tidak bisa mengakses route admin.
     */
    public function test_member_cannot_access_admin_route(): void
    {
        $token = User::factory()->create()->createToken('mobile')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/ping')
            ->assertForbidden()
            ->assertExactJson(['message' => 'Anda tidak memiliki akses ke sumber daya ini.']);
    }

    /**
     * Memastikan admin bisa mengakses route admin.
     */
    public function test_admin_can_access_admin_route(): void
    {
        $token = User::factory()->admin()->create()->createToken('admin-web')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/ping')
            ->assertOk()
            ->assertJson(['message' => 'pong', 'role' => 'admin']);
    }

    /**
     * Memastikan member bisa mengakses route member.
     */
    public function test_member_can_access_member_route(): void
    {
        $token = User::factory()->create()->createToken('mobile')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/member/ping')
            ->assertOk()
            ->assertJson(['message' => 'pong', 'role' => 'member']);
    }
}
