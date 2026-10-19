<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Booking milik member (baris class_participants) beserta ringkasan sesinya.
 * Muat dulu relasi classSchedule (dengan gymClass, instructor, dan participants_count)
 * agar tidak ada query per baris.
 */
class MemberBookingResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $schedule = $this->classSchedule;

        return [
            'id' => $this->id,
            'status' => $this->status,
            'booked_at' => $this->booked_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'schedule' => [
                'id' => $schedule->id,
                'class_id' => $schedule->class_id,
                'class_name' => $schedule->gymClass?->name,
                'instructor_name' => $schedule->instructor?->name,
                'schedule_date' => $schedule->schedule_date->format('Y-m-d'),
                'start_time' => substr((string) $schedule->start_time, 0, 5),
                'end_time' => substr((string) $schedule->end_time, 0, 5),
                'status' => $schedule->status,
                'cancel_reason' => $schedule->cancel_reason,
                'participants_count' => (int) $schedule->participants_count,
                'min_participants' => $schedule->gymClass?->min_participants,
            ],
        ];
    }
}
