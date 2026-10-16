<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClassParticipant extends Model
{
    use HasFactory;

    protected $fillable = [
        'class_schedule_id',
        'user_id',
        'status',
        'booked_at',
    ];

    protected $casts = [
        'booked_at' => 'datetime',
    ];

    /**
     * Setiap booking, pembatalan, atau perubahan peserta memperbarui updated_at jadwal, agar perubahan
     * participants_count terdeteksi oleh polling GET /class-schedules/status (SCRUM-56).
     * Hanya berlaku lewat model Eloquent (create/save/delete); update massal lewat query builder
     * (mis. ClassParticipant::where(...)->update()) harus memperbarui jadwal terkait secara manual.
     */
    protected $touches = ['classSchedule'];

    /**
     * Get the schedule for this participant.
     */
    public function classSchedule(): BelongsTo
    {
        return $this->belongsTo(ClassSchedule::class);
    }

    /**
     * Get the user who booked this class.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
