<?php

namespace Tests\Concerns;

use App\Enums\UserRole;
use App\Models\User;
use App\Services\Auth\ApiTokenService;

/**
 * Helper tes bersama untuk membuat admin/member dan mengirim request dengan Bearer token asli.
 *
 * Token dibuat lewat ApiTokenService (bukan Sanctum::actingAs) supaya tes melewati
 * middleware auth:sanctum dan role yang sebenarnya. Password tidak pernah dipakai,
 * jadi tes tidak bergantung pada password seed.
 *
 * Catatan: guard Sanctum menyimpan user yang sudah terautentikasi selama satu tes.
 * Bila satu tes perlu berganti identitas, panggil $this->app['auth']->forgetGuards() dulu.
 */
trait InteractsWithApiAuth
{
    /**
     * Membuat user dengan peran admin.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function createAdmin(array $attributes = []): User
    {
        return User::factory()->admin()->create($attributes);
    }

    /**
     * Membuat user dengan peran member.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function createMember(array $attributes = []): User
    {
        return User::factory()->create($attributes);
    }

    /**
     * Header Authorization Bearer untuk user tertentu.
     *
     * @return array<string, string>
     */
    protected function bearerHeaders(User $user, ?string $deviceName = null): array
    {
        $deviceName ??= $user->role === UserRole::Admin
            ? ApiTokenService::DEVICE_ADMIN_WEB
            : ApiTokenService::DEVICE_MOBILE;

        $token = app(ApiTokenService::class)->createToken($user, $deviceName)->plainTextToken;

        return ['Authorization' => 'Bearer '.$token];
    }

    /**
     * Membuat admin baru dan memakai tokennya untuk request berikutnya di tes ini.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function actingAsAdmin(array $attributes = []): User
    {
        $admin = $this->createAdmin($attributes);
        $this->withHeaders($this->bearerHeaders($admin));

        return $admin;
    }

    /**
     * Membuat member baru dan memakai tokennya untuk request berikutnya di tes ini.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function actingAsMember(array $attributes = []): User
    {
        $member = $this->createMember($attributes);
        $this->withHeaders($this->bearerHeaders($member));

        return $member;
    }
}
