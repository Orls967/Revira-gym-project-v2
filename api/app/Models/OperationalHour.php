<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OperationalHour extends Model
{
    use HasFactory;

    /**
     * Nilai day_of_week sesuai enum di migration, berurutan Senin sampai Minggu.
     */
    public const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

    protected $fillable = [
        'day_of_week',
        'open_time',
        'close_time',
        'is_closed',
    ];

    protected $casts = [
        'is_closed' => 'boolean',
    ];

    /**
     * Urutkan Senin sampai Minggu (urutan alfabet tidak sesuai urutan hari).
     * Memakai CASE agar sama di MySQL dan SQLite.
     */
    public function scopeOrderByDay(Builder $query): Builder
    {
        $cases = collect(self::DAYS)
            ->map(fn (string $day, int $index) => "WHEN '{$day}' THEN ".($index + 1))
            ->implode(' ');

        return $query->orderByRaw("CASE day_of_week {$cases} ELSE 8 END");
    }
}
