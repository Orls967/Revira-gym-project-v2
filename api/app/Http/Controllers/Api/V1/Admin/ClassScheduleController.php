<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\IndexClassScheduleRequest;
use App\Http\Requests\Admin\StoreClassScheduleRequest;
use App\Http\Requests\Admin\UpdateClassScheduleRequest;
use App\Http\Requests\Admin\UpdateClassScheduleStatusRequest;
use App\Http\Resources\ClassScheduleResource;
use App\Models\ClassSchedule;
use App\Services\Schedules\ClassScheduleService;
use Illuminate\Http\JsonResponse;

class ClassScheduleController extends Controller
{
    public function __construct(private readonly ClassScheduleService $schedules) {}

    /**
     * GET /api/v1/admin/class-schedules
     *
     * Paginasi format Laravel, terurut tanggal lalu jam mulai. Rentang tanggal inklusif.
     */
    public function index(IndexClassScheduleRequest $request): JsonResponse
    {
        $schedules = ClassSchedule::query()
            ->withDetails()
            ->when($request->filled('date_from'), fn ($query) => $query->whereDate('schedule_date', '>=', $request->validated('date_from')))
            ->when($request->filled('date_to'), fn ($query) => $query->whereDate('schedule_date', '<=', $request->validated('date_to')))
            ->when($request->filled('class_id'), fn ($query) => $query->where('class_id', $request->integer('class_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->validated('status')))
            ->chronological()
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return ClassScheduleResource::collection($schedules)->response();
    }

    /**
     * POST /api/v1/admin/class-schedules
     *
     * Jadwal baru selalu berstatus scheduled.
     */
    public function store(StoreClassScheduleRequest $request): JsonResponse
    {
        $schedule = $this->schedules->create($request->validated());

        return response()->json([
            'message' => 'Jadwal berhasil dibuat.',
            'data' => new ClassScheduleResource($schedule->refresh()->loadDetails()),
        ], 201);
    }

    /**
     * GET /api/v1/admin/class-schedules/{classSchedule}
     */
    public function show(ClassSchedule $classSchedule): JsonResponse
    {
        return response()->json([
            'data' => new ClassScheduleResource($classSchedule->loadDetails()),
        ]);
    }

    /**
     * PUT /api/v1/admin/class-schedules/{classSchedule}
     *
     * Hanya jadwal berstatus scheduled yang bisa diubah; status diubah lewat PATCH .../status.
     */
    public function update(UpdateClassScheduleRequest $request, ClassSchedule $classSchedule): JsonResponse
    {
        if ($classSchedule->status !== ClassSchedule::STATUS_SCHEDULED) {
            return response()->json([
                'message' => "Jadwal berstatus {$classSchedule->status} tidak dapat diubah. Hanya jadwal berstatus scheduled yang dapat diubah.",
            ], 409);
        }

        $schedule = $this->schedules->update($classSchedule, $request->validated());

        return response()->json([
            'message' => 'Jadwal berhasil diperbarui.',
            'data' => new ClassScheduleResource($schedule->loadDetails()),
        ]);
    }

    /**
     * PATCH /api/v1/admin/class-schedules/{classSchedule}/status
     */
    public function updateStatus(UpdateClassScheduleStatusRequest $request, ClassSchedule $classSchedule): JsonResponse
    {
        $schedule = $this->schedules->changeStatus(
            $classSchedule,
            $request->validated('status'),
            $request->validated('cancel_reason'),
        );

        return response()->json([
            'message' => 'Status jadwal berhasil diperbarui.',
            'data' => new ClassScheduleResource($schedule->loadDetails()),
        ]);
    }

    /**
     * DELETE /api/v1/admin/class-schedules/{classSchedule}
     *
     * Jadwal yang sudah punya peserta (termasuk yang membatalkan booking) tidak dihapus (FK restrict);
     * admin diarahkan membatalkan jadwal lewat perubahan status.
     */
    public function destroy(ClassSchedule $classSchedule): JsonResponse
    {
        if ($classSchedule->participants()->exists()) {
            return response()->json([
                'message' => 'Jadwal tidak dapat dihapus karena sudah memiliki peserta. Batalkan jadwal lewat PATCH /admin/class-schedules/{id}/status dengan status cancelled.',
            ], 409);
        }

        $classSchedule->delete();

        return response()->json([
            'message' => 'Jadwal berhasil dihapus.',
        ]);
    }
}
