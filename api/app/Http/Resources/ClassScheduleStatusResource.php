<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Item ringkas untuk polling status jadwal publik.
 */
class ClassScheduleStatusResource extends JsonResource
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
            'status' => $this->status,
            'participants_count' => (int) $this->participants_count,
            'min_participants' => $this->gymClass?->min_participants,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
