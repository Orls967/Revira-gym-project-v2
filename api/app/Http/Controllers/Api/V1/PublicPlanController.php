<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicMembershipPlanResource;
use App\Models\MembershipPlan;
use Illuminate\Http\JsonResponse;

class PublicPlanController extends Controller
{
    /**
     * GET /api/v1/membership-plans
     */
    public function __invoke(): JsonResponse
    {
        $plans = MembershipPlan::where('is_active', true)
            ->orderBy('price')
            ->get();

        return response()->json([
            'data' => PublicMembershipPlanResource::collection($plans),
        ]);
    }
}
