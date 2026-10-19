<?php

namespace App\Http\Resources;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Resource untuk respons 201 pengajuan membership (SCRUM-69).
 *
 * TIDAK mengekspos path file receipt_image; hanya has_receipt (boolean).
 */
class MembershipApplicationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $membership = $this->resource['membership'];
        $transaction = $this->resource['transaction'];
        $plan = $membership->membershipPlan;

        return [
            'membership' => [
                'id' => $membership->id,
                'plan' => [
                    'id' => $plan->id,
                    'name' => $plan->name,
                    'duration_days' => $plan->duration_days,
                    'price' => (int) $plan->price,
                ],
                'record_type' => $membership->record_type,
                'start_date' => $membership->start_date?->toDateString(),
                'end_date' => $membership->end_date?->toDateString(),
                'status' => $membership->status,
            ],
            'transaction' => [
                'id' => $transaction->id,
                'amount' => (int) $transaction->amount,
                'payment_method' => $transaction->payment_method,
                'verification_status' => $transaction->verification_status,
                'has_receipt' => $transaction->receipt_image !== null,
                'created_at' => $transaction->created_at?->toIso8601String(),
            ],
        ];
    }

    /**
     * Wrap respons dengan message dan data sesuai konvensi API.
     *
     * @return array<string, mixed>
     */
    public function with(Request $request): array
    {
        return [
            'message' => 'Pengajuan membership berhasil dikirim dan menunggu verifikasi admin.',
        ];
    }

    /**
     * Sesuaikan wrapping respons: message di luar data.
     *
     * @param  JsonResponse  $response
     */
    public function withResponse(Request $request, $response): void
    {
        // Pastikan urutan: message, data
        $data = $response->getData(true);
        $ordered = [
            'message' => $data['message'] ?? '',
            'data' => $data['data'] ?? [],
        ];
        $response->setData($ordered);
    }
}
