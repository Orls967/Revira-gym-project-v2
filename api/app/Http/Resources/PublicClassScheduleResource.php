<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Jadwal kelas untuk publik: tanpa data pribadi (instruktur hanya nama, tanpa daftar peserta).
 * Muat dulu lewat scope ClassSchedule::withDetails() agar tidak ada query per baris.
 */
class PublicClassScheduleResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'class_id' => $this->class_id,
            'class_name' => $this->gymClass?->name,
            'instructor_name' => $this->instructor?->name,
            'schedule_date' => $this->schedule_date->format('Y-m-d'),
            'start_time' => substr((string) $this->start_time, 0, 5),
            'end_time' => substr((string) $this->end_time, 0, 5),
            'status' => $this->status,
            'cancel_reason' => $this->cancel_reason,
            'participants_count' => (int) $this->participants_count,
            'min_participants' => $this->gymClass?->min_participants,
            // Titik awal updated_since untuk polling status berikutnya
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
