<?php

namespace App\Services\Auth;

use App\Models\User;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Helper untuk membuat dan mencabut Bearer token Sanctum (personal access token).
 *
 * Dipakai oleh dua klien: aplikasi mobile member dan Admin Web.
 */
class ApiTokenService
{
    public const DEVICE_MOBILE = 'mobile';

    public const DEVICE_ADMIN_WEB = 'admin-web';

    /**
     * Membuat token baru untuk user. Nama token diisi dari device_name yang dikirim klien.
     */
    public function createToken(User $user, string $deviceName): NewAccessToken
    {
        return $user->createToken(mb_substr(trim($deviceName), 0, 255));
    }

    /**
     * Mencabut token yang sedang dipakai pada request saat ini (logout satu perangkat).
     */
    public function revokeCurrentToken(User $user): void
    {
        $token = $user->currentAccessToken();

        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }
    }

    /**
     * Mencabut semua token milik user (logout dari semua perangkat).
     */
    public function revokeAllTokens(User $user): void
    {
        $user->tokens()->delete();
    }
}
