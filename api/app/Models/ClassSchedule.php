<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClassSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'class_id',
        'instructor_id',
        'schedule_date',
        'start_time',
        'end_time',
        'status',
        'cancel_reason',
    ];

    protected $casts = [
        'schedule_date' => 'date',
    ];

    /**
     * Jadwal yang belum lewat dan masih akan berjalan (hari ini atau setelahnya, belum selesai/dibatalkan).
     */
    public function scopeUpcoming(Builder $query): Builder
    {
        return $query
            ->whereDate('schedule_date', '>=', today())
            ->whereIn('status', ['scheduled', 'ongoing']);
    }

    /**
     * Get the class for this schedule.
     */
    public function gymClass(): BelongsTo
    {
        return $this->belongsTo(GymClass::class, 'class_id');
    }

    /**
     * Get the instructor for this schedule.
     */
    public function instructor(): BelongsTo
    {
        return $this->belongsTo(Instructor::class);
    }

    /**
     * Get the participants for this schedule.
     */
    public function participants(): HasMany
    {
        return $this->hasMany(ClassParticipant::class);
    }
}
