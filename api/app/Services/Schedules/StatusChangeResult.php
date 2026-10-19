<?php

namespace App\Services\Schedules;

use App\Models\ClassSchedule;

/**
 * Hasil ClassScheduleService::changeStatus(): jadwal setelah diubah dan jumlah booking yang ikut dibatalkan.
 */
final readonly class StatusChangeResult
{
    public function __construct(
        public ClassSchedule $schedule,
        public int $cancelledBookingsCount = 0,
    ) {}
}
