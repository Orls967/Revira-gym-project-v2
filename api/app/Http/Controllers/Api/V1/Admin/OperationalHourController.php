<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreOperationalHourRequest;
use App\Http\Requests\Admin\UpdateOperationalHourRequest;
use App\Http\Resources\OperationalHourResource;
use App\Models\OperationalHour;
use Illuminate\Http\JsonResponse;

class OperationalHourController extends Controller
{
    /**
     * GET /api/v1/admin/operational-hours
     */
    public function index(): JsonResponse
    {
        $hours = OperationalHour::orderByDay()->get();

        return response()->json([
            'data' => OperationalHourResource::collection($hours),
        ]);
    }

    /**
     * POST /api/v1/admin/operational-hours
     */
    public function store(StoreOperationalHourRequest $request): JsonResponse
    {
        $hour = OperationalHour::create($request->operationalHourData());

        return response()->json([
            'message' => 'Jam operasional berhasil dibuat.',
            'data' => new OperationalHourResource($hour),
        ], 201);
    }

    /**
     * GET /api/v1/admin/operational-hours/{operationalHour}
     */
    public function show(OperationalHour $operationalHour): JsonResponse
    {
        return response()->json([
            'data' => new OperationalHourResource($operationalHour),
        ]);
    }

    /**
     * PUT /api/v1/admin/operational-hours/{operationalHour}
     */
    public function update(UpdateOperationalHourRequest $request, OperationalHour $operationalHour): JsonResponse
    {
        $operationalHour->update($request->operationalHourData());

        return response()->json([
            'message' => 'Jam operasional berhasil diperbarui.',
            'data' => new OperationalHourResource($operationalHour),
        ]);
    }

    /**
     * DELETE /api/v1/admin/operational-hours/{operationalHour}
     */
    public function destroy(OperationalHour $operationalHour): JsonResponse
    {
        $operationalHour->delete();

        return response()->json([
            'message' => 'Jam operasional berhasil dihapus.',
        ]);
    }
}
