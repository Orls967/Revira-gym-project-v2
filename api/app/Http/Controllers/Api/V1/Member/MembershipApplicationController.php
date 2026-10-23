<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Http\Requests\Member\StoreMembershipApplicationRequest;
use App\Http\Resources\MembershipApplicationResource;
use App\Models\User;
use App\Services\Memberships\MembershipApplicationService;
use Illuminate\Http\JsonResponse;

/**
 * Menangani pengajuan membership baru atau perpanjangan oleh member (SCRUM-69).
 */
class MembershipApplicationController extends Controller
{
    public function __construct(
        private readonly MembershipApplicationService $service
    ) {}

    /**
     * POST /api/v1/member/memberships
     * Mengajukan membership baru dengan atau tanpa bukti transfer.
     */
    public function __invoke(StoreMembershipApplicationRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $result = $this->service->submit(
            $user,
            $request->only(['membership_plan_id', 'start_date', 'payment_method']),
            $request->file('receipt_image')
        );

        return (new MembershipApplicationResource($result))
            ->response()
            ->setStatusCode(201);
    }
}
