<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicOperationalHourResource;
use App\Models\OperationalHour;
use Illuminate\Http\JsonResponse;

class PublicOperationalHourController extends Controller
{
    /**
     * GET /api/v1/operational-hours
     */
    public function __invoke(): JsonResponse
    {
        $orderCase = "CASE day_of_week
            WHEN 'Senin' THEN 1
            WHEN 'Selasa' THEN 2
            WHEN 'Rabu' THEN 3
            WHEN 'Kamis' THEN 4
            WHEN 'Jumat' THEN 5
            WHEN 'Sabtu' THEN 6
            WHEN 'Minggu' THEN 7
            ELSE 8 END";

        $hours = OperationalHour::orderByRaw($orderCase)->get();

        return response()->json([
            'data' => PublicOperationalHourResource::collection($hours),
        ]);
    }
}
