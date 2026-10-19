<?php

namespace App\Services\Memberships;

use App\Models\Membership;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

/**
 * Satu sumber aturan "member aktif" (B6, SCRUM-71): membership active dengan start_date <= tanggal <= end_date (WITA).
 * Dipakai /me, booking (SCRUM-70), approve transaksi (SCRUM-67), dan daftar member (SCRUM-68).
 * Seorang user boleh punya dua membership active (yang berjalan dan perpanjangannya) asalkan periodenya tidak tumpang tindih.
 */
class MembershipStatus
{
    public const INACTIVE_ON_DATE_MESSAGE = 'Membership tidak aktif pada tanggal sesi.';

    public const OVERLAPPING_MESSAGE = 'Periode membership tumpang tindih dengan membership aktif lain.';

    /**
     * Membership yang berlaku pada tanggal tersebut, atau null bila tidak ada.
     */
    public function activeOn(User $user, CarbonInterface|string $date): ?Membership
    {
        return $user->memberships()
            ->activeOn($date)
            ->latest('end_date')
            ->first();
    }

    public function isActiveOn(User $user, CarbonInterface|string $date): bool
    {
        return $user->memberships()->activeOn($date)->exists();
    }

    public function isActiveToday(User $user): bool
    {
        return $this->isActiveOn($user, today());
    }

    /**
     * Lempar 422 bila user tidak aktif pada tanggal tersebut (mis. tanggal sesi saat booking).
     *
     * @throws ValidationException
     */
    public function ensureActiveOn(User $user, CarbonInterface|string $date, string $field = 'membership'): void
    {
        if (! $this->isActiveOn($user, $date)) {
            throw ValidationException::withMessages([$field => self::INACTIVE_ON_DATE_MESSAGE]);
        }
    }

    /**
     * Apakah rentang tanggal beririsan dengan membership active lain milik user (untuk approve perpanjangan).
     */
    public function overlapsActive(User $user, CarbonInterface|string $startDate, CarbonInterface|string $endDate, ?Membership $ignore = null): bool
    {
        return $user->memberships()
            ->overlapping($startDate, $endDate)
            ->when($ignore, fn ($query) => $query->whereKeyNot($ignore->getKey()))
            ->exists();
    }
}
