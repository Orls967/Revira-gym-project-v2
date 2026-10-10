<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicOperationalHourResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'day_of_week' => $this->day_of_week,
            'open_time' => $this->open_time ? substr((string) $this->open_time, 0, 5) : null,
            'close_time' => $this->close_time ? substr((string) $this->close_time, 0, 5) : null,
            'is_closed' => (bool) $this->is_closed,
        ];
    }
}
