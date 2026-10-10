<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreMembershipPlanRequest;
use App\Http\Requests\Admin\UpdateMembershipPlanRequest;
use App\Http\Resources\MembershipPlanResource;
use App\Models\MembershipPlan;
use Illuminate\Http\JsonResponse;

class MembershipPlanController extends Controller
{
    /**
     * GET /api/v1/admin/membership-plans
     */
    public function index(): JsonResponse
    {
        $plans = MembershipPlan::orderBy('id')->get();

        return response()->json([
            'data' => MembershipPlanResource::collection($plans),
        ]);
    }

    /**
     * POST /api/v1/admin/membership-plans
     */
    public function store(StoreMembershipPlanRequest $request): JsonResponse
    {
        $plan = MembershipPlan::create($request->validated());

        return response()->json([
            'message' => 'Paket membership berhasil dibuat.',
            'data' => new MembershipPlanResource($plan),
        ], 201);
    }

    /**
     * GET /api/v1/admin/membership-plans/{membershipPlan}
     */
    public function show(MembershipPlan $membershipPlan): JsonResponse
    {
        return response()->json([
            'data' => new MembershipPlanResource($membershipPlan),
        ]);
    }

    /**
     * PUT /api/v1/admin/membership-plans/{membershipPlan}
     */
    public function update(UpdateMembershipPlanRequest $request, MembershipPlan $membershipPlan): JsonResponse
    {
        $membershipPlan->update($request->validated());

        return response()->json([
            'message' => 'Paket membership berhasil diperbarui.',
            'data' => new MembershipPlanResource($membershipPlan),
        ]);
    }

    /**
     * DELETE /api/v1/admin/membership-plans/{membershipPlan}
     */
    public function destroy(MembershipPlan $membershipPlan): JsonResponse
    {
        if ($membershipPlan->memberships()->exists()) {
            return response()->json([
                'message' => 'Paket membership tidak dapat dihapus karena sudah pernah digunakan oleh member. Silakan nonaktifkan paket (is_active = false) sebagai alternatif.',
            ], 409);
        }

        $membershipPlan->delete();

        return response()->json([
            'message' => 'Paket membership berhasil dihapus.',
        ]);
    }
}
