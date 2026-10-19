<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Representasi transaksi untuk admin pada antrean verifikasi.
 * Path file fisik receipt_image tidak pernah diekspos langsung;
 * klien mengakses bukti transfer lewat receipt_url privat.
 */
class AdminTransactionResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $hasReceipt = ! is_null($this->receipt_image);

        return [
            'id' => (int) $this->id,
            'member' => [
                'id' => (int) $this->user?->id,
                'name' => $this->user?->name,
                'email' => $this->user?->email,
                'phone_number' => $this->user?->phone_number,
            ],
            'plan' => [
                'id' => (int) $this->membership?->membershipPlan?->id,
                'name' => $this->membership?->membershipPlan?->name,
                'duration_days' => (int) $this->membership?->membershipPlan?->duration_days,
            ],
            'record_type' => $this->membership?->record_type,
            'start_date' => $this->membership?->start_date?->format('Y-m-d'),
            'amount' => (int) round($this->amount),
            'payment_method' => $this->payment_method,
            'verification_status' => $this->verification_status,
            'has_receipt' => $hasReceipt,
            'receipt_url' => $hasReceipt ? "/api/v1/transactions/{$this->id}/receipt" : null,
            'reject_reason' => $this->reject_reason,
            'verified_at' => $this->verified_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
