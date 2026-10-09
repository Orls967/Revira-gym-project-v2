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
     * GET /api/v1/admin/membership-plans/{id}
     */
    public function show(int $id): JsonResponse
    {
        $plan = MembershipPlan::find($id);

        if (! $plan) {
            return response()->json([
                'message' => 'Paket membership tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'data' => new MembershipPlanResource($plan),
        ]);
    }

    /**
     * PUT /api/v1/admin/membership-plans/{id}
     */
    public function update(UpdateMembershipPlanRequest $request, int $id): JsonResponse
    {
        $plan = MembershipPlan::find($id);

        if (! $plan) {
            return response()->json([
                'message' => 'Paket membership tidak ditemukan.',
            ], 404);
        }

        $plan->update($request->validated());

        return response()->json([
            'message' => 'Paket membership berhasil diperbarui.',
            'data' => new MembershipPlanResource($plan),
        ]);
    }

    /**
     * DELETE /api/v1/admin/membership-plans/{id}
     */
    public function destroy(int $id): JsonResponse
    {
        $plan = MembershipPlan::find($id);

        if (! $plan) {
            return response()->json([
                'message' => 'Paket membership tidak ditemukan.',
            ], 404);
        }

        if ($plan->memberships()->exists()) {
            return response()->json([
                'message' => 'Paket membership tidak dapat dihapus karena sudah pernah digunakan oleh member. Silakan nonaktifkan paket (is_active = false) sebagai alternatif.',
            ], 409);
        }

        $plan->delete();

        return response()->json([
            'message' => 'Paket membership berhasil dihapus.',
        ]);
    }
}
