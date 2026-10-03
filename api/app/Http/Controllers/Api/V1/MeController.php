<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Profil member yang sedang login beserta status keanggotaannya.
 */
class MeController extends Controller
{
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
     * Ringkasan membership. Jika ada yang sedang berlaku, itu yang ditampilkan;
     * jika tidak, status diambil dari catatan terakhir (pending, rejected, expired) atau none.
     *
     * @return array<string, mixed>
     */
    private function membershipSummary(User $user): array
    {
        $active = $user->memberships()
            ->currentlyActive()
            ->with('membershipPlan')
            ->latest('end_date')
            ->first();

        $membership = $active ?? $user->memberships()
            ->with('membershipPlan')
            ->latest('id')
            ->first();

        if (! $membership) {
            return [
                'is_active' => false,
                'status' => 'none',
                'plan' => null,
                'start_date' => null,
                'end_date' => null,
            ];
        }

        // Status active yang end_date-nya sudah lewat dilaporkan sebagai expired
        $status = $active || $membership->status !== 'active' ? $membership->status : 'expired';

        return [
            'is_active' => $active !== null,
            'status' => $status,
            'plan' => $this->planSummary($membership),
            'start_date' => $membership->start_date?->toDateString(),
            'end_date' => $membership->end_date?->toDateString(),
        ];
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
