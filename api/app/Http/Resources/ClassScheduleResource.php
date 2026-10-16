<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Jadwal kelas untuk admin. Muat dulu lewat scope ClassSchedule::withDetails() / loadDetails()
 * agar nama kelas, nama instruktur, dan participants_count tersedia tanpa query per baris.
 */
class ClassScheduleResource extends JsonResource
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
            'instructor_id' => $this->instructor_id,
            'instructor_name' => $this->instructor?->name,
            // Kolom date diserialisasi Y-m-d agar tidak bergeser hari karena zona waktu
            'schedule_date' => $this->schedule_date->format('Y-m-d'),
            // MySQL menyimpan HH:MM:SS; kontrak memakai HH:MM
            'start_time' => substr((string) $this->start_time, 0, 5),
            'end_time' => substr((string) $this->end_time, 0, 5),
            'status' => $this->status,
            'cancel_reason' => $this->cancel_reason,
            'participants_count' => (int) $this->participants_count,
            'min_participants' => $this->gymClass?->min_participants,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
