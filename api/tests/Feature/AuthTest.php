<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Memastikan login sukses mengembalikan token dan data user sesuai kontrak.
     */
    public function test_login_success_returns_token_and_user(): void
    {
        $user = User::factory()->create(['email' => 'member@example.com']);

        $response = $this->postJson('/api/v1/login', [
            'email' => 'member@example.com',
            'password' => 'password',
            'device_name' => 'mobile',
        ]);

        $response->assertOk()
            ->assertExactJsonStructure([
                'message',
                'data' => [
                    'token',
                    'token_type',
                    'user' => ['id', 'name', 'email', 'role'],
                ],
            ])
            ->assertJson([
                'message' => 'Login berhasil',
                'data' => [
                    'token_type' => 'Bearer',
                    'user' => [
                        'id' => $user->id,
                        'name' => $user->name,
                        'email' => $user->email,
                        'role' => 'member',
                    ],
                ],
            ]);

        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $user->id,
            'name' => 'mobile',
        ]);

        // Token yang diterima bisa langsung dipakai ke route yang dilindungi
        $this->withToken($response->json('data.token'))
            ->getJson('/api/v1/user')
            ->assertOk()
            ->assertJson(['id' => $user->id]);
    }

    /**
     * Memastikan admin juga bisa login dan role-nya terkirim ke klien.
     */
    public function test_admin_login_returns_admin_role(): void
    {
        User::factory()->admin()->create(['email' => 'admin@example.com']);

        $this->postJson('/api/v1/login', [
            'email' => 'admin@example.com',
            'password' => 'password',
            'device_name' => 'admin-web',
        ])
            ->assertOk()
            ->assertJsonPath('data.user.role', 'admin');
    }

    /**
     * Memastikan password salah ditolak dengan pesan umum dan tanpa token.
     */
    public function test_login_fails_with_wrong_password(): void
    {
        User::factory()->create(['email' => 'member@example.com']);

        $this->postJson('/api/v1/login', [
            'email' => 'member@example.com',
            'password' => 'salah',
            'device_name' => 'mobile',
        ])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Email atau password salah.']);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    /**
     * Memastikan email yang tidak terdaftar mendapat respons yang sama dengan password salah.
     */
    public function test_login_fails_with_unknown_email(): void
    {
        $this->postJson('/api/v1/login', [
            'email' => 'tidak-ada@example.com',
            'password' => 'password',
            'device_name' => 'mobile',
        ])
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Email atau password salah.']);
    }

    /**
     * Memastikan body kosong mengembalikan format validasi bawaan Laravel.
     */
    public function test_login_validation_fails_with_empty_body(): void
    {
        $this->postJson('/api/v1/login', [])
            ->assertUnprocessable()
            ->assertJsonStructure(['message', 'errors'])
            ->assertJsonValidationErrors(['email', 'password', 'device_name']);
    }

    /**
     * Memastikan device_name hanya menerima mobile atau admin-web.
     */
    public function test_login_validation_rejects_unknown_device_name(): void
    {
        User::factory()->create(['email' => 'member@example.com']);

        $this->postJson('/api/v1/login', [
            'email' => 'member@example.com',
            'password' => 'password',
            'device_name' => 'desktop',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['device_name']);
    }

    /**
     * Memastikan login dibatasi 5 percobaan per menit.
     */
    public function test_login_is_rate_limited(): void
    {
        $payload = [
            'email' => 'member@example.com',
            'password' => 'salah',
            'device_name' => 'mobile',
        ];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/login', $payload)->assertUnauthorized();
        }

        $this->postJson('/api/v1/login', $payload)->assertTooManyRequests();
    }

    /**
     * Memastikan logout mencabut token sehingga token lama tidak bisa dipakai lagi.
     */
    public function test_logout_revokes_current_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('mobile')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/logout')
            ->assertOk()
            ->assertExactJson(['message' => 'Logout berhasil']);

        $this->assertSame(0, $user->tokens()->count());

        // Reset guard yang di-cache antar request dalam satu test agar token dicek ulang
        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/v1/user')
            ->assertUnauthorized();
    }

    /**
     * Memastikan logout hanya mencabut token perangkat ini, bukan perangkat lain.
     */
    public function test_logout_keeps_other_device_tokens(): void
    {
        $user = User::factory()->create();
        $mobileToken = $user->createToken('mobile')->plainTextToken;
        $user->createToken('admin-web');

        $this->withToken($mobileToken)->postJson('/api/v1/logout')->assertOk();

        $this->assertSame(['admin-web'], $user->tokens()->pluck('name')->all());
    }

    /**
     * Memastikan logout tanpa token ditolak dengan 401 JSON.
     */
    public function test_logout_requires_token(): void
    {
        $this->postJson('/api/v1/logout')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }
}
