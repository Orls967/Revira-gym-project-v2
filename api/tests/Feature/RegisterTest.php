<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, string>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Member Baru',
            'email' => 'baru@example.com',
            'phone_number' => '081234567890',
            'password' => 'rahasia123',
            'password_confirmation' => 'rahasia123',
            'device_name' => 'mobile',
        ], $overrides);
    }

    /**
     * Memastikan registrasi membuat akun member dan langsung mengembalikan token sesuai kontrak login.
     */
    public function test_register_creates_member_and_returns_token(): void
    {
        $response = $this->postJson('/api/v1/register', $this->payload());

        $response->assertCreated()
            ->assertExactJsonStructure([
                'message',
                'data' => [
                    'token',
                    'token_type',
                    'user' => ['id', 'name', 'email', 'role'],
                ],
            ])
            ->assertJson([
                'message' => 'Registrasi berhasil',
                'data' => [
                    'token_type' => 'Bearer',
                    'user' => [
                        'name' => 'Member Baru',
                        'email' => 'baru@example.com',
                        'role' => 'member',
                    ],
                ],
            ]);

        $user = User::where('email', 'baru@example.com')->firstOrFail();
        $this->assertSame('081234567890', $user->phone_number);
        $this->assertTrue(Hash::check('rahasia123', $user->password));
        $this->assertSame(['mobile'], $user->tokens()->pluck('name')->all());

        // Token hasil registrasi bisa langsung dipakai ke /me
        $this->withToken($response->json('data.token'))
            ->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    /**
     * Memastikan field role dari input diabaikan sehingga registrasi tidak bisa membuat admin.
     */
    public function test_register_ignores_role_from_input(): void
    {
        $this->postJson('/api/v1/register', $this->payload(['role' => 'admin']))
            ->assertCreated()
            ->assertJsonPath('data.user.role', 'member');

        $this->assertDatabaseHas('users', ['email' => 'baru@example.com', 'role' => 'member']);
    }

    /**
     * Memastikan email dan nomor HP diseragamkan sebelum disimpan.
     */
    public function test_register_normalizes_email_and_phone(): void
    {
        $this->postJson('/api/v1/register', $this->payload([
            'email' => '  Baru@Example.COM ',
            'phone_number' => '+62 812-3456-7890',
        ]))->assertCreated();

        $this->assertDatabaseHas('users', [
            'email' => 'baru@example.com',
            'phone_number' => '081234567890',
        ]);
    }

    /**
     * Memastikan email yang sudah terdaftar ditolak, termasuk beda huruf besar/kecil.
     */
    public function test_register_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'baru@example.com']);

        $this->postJson('/api/v1/register', $this->payload(['email' => 'BARU@example.com']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);

        $this->assertDatabaseCount('users', 1);
    }

    /**
     * Memastikan body kosong mengembalikan format validasi bawaan Laravel untuk semua field wajib.
     */
    public function test_register_validation_fails_with_empty_body(): void
    {
        $this->postJson('/api/v1/register', [])
            ->assertUnprocessable()
            ->assertJsonStructure(['message', 'errors'])
            ->assertJsonValidationErrors(['name', 'email', 'phone_number', 'password', 'device_name']);
    }

    /**
     * Memastikan aturan password, nomor HP, dan device_name ditegakkan.
     */
    public function test_register_validation_rejects_invalid_fields(): void
    {
        $this->postJson('/api/v1/register', $this->payload([
            'phone_number' => '12345',
            'password' => 'pendek',
            'password_confirmation' => 'beda',
            'device_name' => 'admin-web',
        ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone_number', 'password', 'device_name']);

        $this->assertDatabaseCount('users', 0);
    }

    /**
     * Memastikan registrasi dibatasi 5 percobaan per menit.
     */
    public function test_register_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/register', [])->assertUnprocessable();
        }

        $this->postJson('/api/v1/register', [])->assertTooManyRequests();
    }

    /**
     * Memastikan kuota register terpisah dari login, sehingga gagal registrasi tidak memblokir login.
     */
    public function test_register_attempts_do_not_consume_login_rate_limit(): void
    {
        User::factory()->create(['email' => 'member@example.com']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/register', [])->assertUnprocessable();
        }

        $this->postJson('/api/v1/login', [
            'email' => 'member@example.com',
            'password' => 'password',
            'device_name' => 'mobile',
        ])->assertOk();
    }
}
