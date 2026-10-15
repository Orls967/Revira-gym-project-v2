<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OperationalHourResource extends JsonResource
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
            'day_of_week' => $this->day_of_week,
            // MySQL menyimpan HH:MM:SS; kontrak memakai HH:MM
            'open_time' => $this->open_time ? substr((string) $this->open_time, 0, 5) : null,
            'close_time' => $this->close_time ? substr((string) $this->close_time, 0, 5) : null,
            'is_closed' => (bool) $this->is_closed,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
