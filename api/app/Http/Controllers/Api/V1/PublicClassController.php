<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicGymClassResource;
use App\Models\GymClass;
use Illuminate\Http\JsonResponse;

class PublicClassController extends Controller
{
    /**
     * GET /api/v1/classes
     */
    public function __invoke(): JsonResponse
    {
        $classes = GymClass::where('is_active', true)
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => PublicGymClassResource::collection($classes),
        ]);
    }
}
