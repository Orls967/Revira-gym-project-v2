<?php

namespace App\Http\Resources;

use App\Services\Members\MemberListing;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Satu baris daftar member Admin Web (SCRUM-68). Paket dan tanggal diambil dari membership
 * yang menentukan membership_status (B11); bernilai null bila status none.
 */
class AdminMemberResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        ['status' => $status, 'membership' => $membership] = MemberListing::currentFor($this->resource);
        $plan = $membership?->membershipPlan;

        return [
            'id' => (int) $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone_number' => $this->phone_number,
            'membership_status' => $status,
            'plan' => $plan ? [
                'id' => (int) $plan->id,
                'name' => $plan->name,
                'duration_days' => (int) $plan->duration_days,
            ] : null,
            'start_date' => $membership?->start_date?->format('Y-m-d'),
            'end_date' => $membership?->end_date?->format('Y-m-d'),
            'registered_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
