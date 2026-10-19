<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\User;
use App\Services\Memberships\MembershipStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Profil member yang sedang login beserta status keanggotaannya.
 */
class MeController extends Controller
{
    public function __construct(private readonly MembershipStatus $membershipStatus) {}

    /**
     * GET /api/v1/me. Aplikasi mobile memakai membership.is_active untuk mengaktifkan tombol booking.
     */
    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone_number' => $user->phone_number,
                'profile_photo' => $user->profile_photo,
                'role' => $user->role,
                'membership' => $this->membershipSummary($user),
            ],
        ]);
    }

    /**
     * Ringkasan membership dengan prioritas: yang berlaku hari ini (aturan B6), lalu membership active
     * yang belum mulai (upcoming), lalu catatan terakhir (pending, rejected, expired), atau none.
     * Dengan begitu pengajuan perpanjangan tidak menutupi membership yang sedang berjalan.
     *
     * @return array<string, mixed>
     */
    private function membershipSummary(User $user): array
    {
        $active = $this->membershipStatus->activeOn($user, today());

        $membership = $active
            ?? $user->memberships()->upcoming()->oldest('start_date')->first()
            ?? $user->memberships()->latest('id')->first();

        if (! $membership) {
            return [
                'is_active' => false,
                'status' => 'none',
                'plan' => null,
                'start_date' => null,
                'end_date' => null,
            ];
        }

        $membership->loadMissing('membershipPlan');

        return [
            'is_active' => $active !== null,
            'status' => $active ? 'active' : $this->inactiveStatus($membership),
            'plan' => $this->planSummary($membership),
            'start_date' => $membership->start_date?->toDateString(),
            'end_date' => $membership->end_date?->toDateString(),
        ];
    }

    /**
     * Status untuk membership yang tidak berlaku hari ini. Status active yang belum mulai dilaporkan upcoming,
     * dan yang end_date-nya sudah lewat dilaporkan expired walau job expiry belum jalan.
     */
    private function inactiveStatus(Membership $membership): string
    {
        if ($membership->status !== 'active') {
            return $membership->status;
        }

        return $membership->start_date?->isAfter(today()) ? 'upcoming' : 'expired';
    }

    /**
     * @return array<string, mixed>
     */
    private function planSummary(Membership $membership): array
    {
        return [
            'id' => $membership->membershipPlan->id,
            'name' => $membership->membershipPlan->name,
            'duration_days' => $membership->membershipPlan->duration_days,
        ];
    }
}
