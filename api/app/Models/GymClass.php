<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GymClass extends Model
{
    use HasFactory;

    protected $table = 'classes';

    protected $attributes = [
        'is_active' => true,
    ];

    protected $fillable = [
        'name',
        'description',
        'min_participants',
        'default_instructor_id',
        'is_active',
    ];

    protected $casts = [
        'min_participants' => 'integer',
        'is_active' => 'boolean',
    ];

    /**
     * min_participants ikut tampil di polling status jadwal (SCRUM-56), jadi perubahannya memperbarui
     * updated_at jadwal kelas ini yang belum lewat agar terdeteksi lewat updated_since.
     */
    protected static function booted(): void
    {
        static::updated(function (GymClass $gymClass) {
            if ($gymClass->wasChanged('min_participants')) {
                $gymClass->classSchedules()->whereDate('schedule_date', '>=', today())->touch();
            }
        });
    }

    /**
     * Hanya kelas aktif. Kelas nonaktif tidak boleh dipilih untuk jadwal baru (SCRUM-55).
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Get the default instructor for this class.
     */
    public function defaultInstructor(): BelongsTo
    {
        return $this->belongsTo(Instructor::class, 'default_instructor_id');
    }

    /**
     * Get the schedules for this class.
     */
    public function classSchedules(): HasMany
    {
        return $this->hasMany(ClassSchedule::class, 'class_id');
    }
}
