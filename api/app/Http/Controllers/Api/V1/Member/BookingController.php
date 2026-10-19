<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Http\Resources\MemberBookingResource;
use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\User;
use App\Services\Bookings\BookingService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Booking sesi kelas oleh member (SCRUM-70).
 */
class BookingController extends Controller
{
    public function __construct(private readonly BookingService $bookings) {}

    /**
     * GET /api/v1/member/bookings
     *
     * Booking milik sendiri (booked, attended, atau cancelled) untuk sesi yang jam selesainya belum lewat,
     * termasuk sesi yang dibatalkan admin, terurut tanggal lalu jam mulai. Tanpa paginasi.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $bookings = ClassParticipant::query()
            ->where('user_id', $user->id)
            ->whereHas('classSchedule', fn (Builder $query) => $query->notEnded())
            ->with(['classSchedule' => fn ($query) => $query->withDetails()])
            ->join('class_schedules', 'class_schedules.id', '=', 'class_participants.class_schedule_id')
            ->orderBy('class_schedules.schedule_date')
            ->orderBy('class_schedules.start_time')
            ->orderBy('class_participants.id')
            ->select('class_participants.*')
            ->get();

        return response()->json([
            'data' => MemberBookingResource::collection($bookings),
        ]);
    }

    /**
     * POST /api/v1/member/class-schedules/{classSchedule}/booking
     */
    public function store(Request $request, ClassSchedule $classSchedule): JsonResponse
    {
        $booking = $this->bookings->book($request->user(), $classSchedule);

        return response()->json([
            'message' => 'Booking kelas berhasil.',
            'data' => new MemberBookingResource($this->loadSchedule($booking)),
        ], 201);
    }

    /**
     * DELETE /api/v1/member/class-schedules/{classSchedule}/booking
     */
    public function destroy(Request $request, ClassSchedule $classSchedule): JsonResponse
    {
        $booking = $this->bookings->cancel($request->user(), $classSchedule);

        return response()->json([
            'message' => 'Booking kelas berhasil dibatalkan.',
            'data' => new MemberBookingResource($this->loadSchedule($booking)),
        ]);
    }

    private function loadSchedule(ClassParticipant $booking): ClassParticipant
    {
        return $booking->load(['classSchedule' => fn ($query) => $query->withDetails()]);
    }
}
