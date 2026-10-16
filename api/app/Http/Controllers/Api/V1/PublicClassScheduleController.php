<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Schedules\ClassScheduleStatusRequest;
use App\Http\Requests\Schedules\PublicClassScheduleRequest;
use App\Http\Resources\ClassScheduleStatusResource;
use App\Http\Resources\PublicClassScheduleResource;
use App\Models\ClassSchedule;
use Illuminate\Http\JsonResponse;

class PublicClassScheduleController extends Controller
{
    /**
     * GET /api/v1/class-schedules
     *
     * Semua status ikut tampil (termasuk cancelled beserta alasannya). Tanpa paginasi karena rentang tanggal dibatasi.
     */
    public function index(PublicClassScheduleRequest $request): JsonResponse
    {
        $schedules = ClassSchedule::query()
            ->withDetails()
            ->betweenDates($request->dateFrom(), $request->dateTo())
            ->chronological()
            ->get();

        return response()->json([
            'data' => PublicClassScheduleResource::collection($schedules),
        ]);
    }

    /**
     * GET /api/v1/class-schedules/status
     *
     * Respons ringkas untuk polling. updated_since inklusif (>=) karena updated_at hanya presisi detik,
     * jadi perubahan pada detik yang sama tidak terlewat; klien cukup menimpa item dengan id yang sama.
     * ETag dan 304 diurus middleware cache.headers di route.
     */
    public function status(ClassScheduleStatusRequest $request): JsonResponse
    {
        $updatedSince = $request->updatedSince();

        $schedules = ClassSchedule::query()
            ->with('gymClass:id,min_participants')
            ->withParticipantsCount()
            ->betweenDates($request->dateFrom(), $request->dateTo())
            ->when($updatedSince, fn ($query) => $query->where('updated_at', '>=', $updatedSince->format('Y-m-d H:i:s')))
            ->chronological()
            ->get(['id', 'class_id', 'status', 'updated_at']);

        return response()->json([
            'data' => ClassScheduleStatusResource::collection($schedules),
        ]);
    }
}
