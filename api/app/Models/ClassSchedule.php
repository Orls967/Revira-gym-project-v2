<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClassSchedule extends Model
{
    use HasFactory;

    public const STATUS_SCHEDULED = 'scheduled';

    public const STATUS_ONGOING = 'ongoing';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    /** Urutan sesuai enum kolom status di migration. */
    public const STATUSES = [
        self::STATUS_SCHEDULED,
        self::STATUS_ONGOING,
        self::STATUS_COMPLETED,
        self::STATUS_CANCELLED,
    ];

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
     * Jadwal yang masih akan berjalan atau sedang berjalan: status scheduled/ongoing dan jam selesainya belum lewat
     * (tanggal setelah hari ini, atau hari ini dengan end_time setelah jam sekarang, WITA).
     * Sesi hari ini yang jam selesainya sudah lewat tidak dihitung walau statusnya belum diubah ke completed.
     */
    public function scopeUpcoming(Builder $query): Builder
    {
        return $query
            ->whereIn('status', [self::STATUS_SCHEDULED, self::STATUS_ONGOING])
            ->notEnded();
    }

    /**
     * Jadwal yang jam selesainya belum lewat (WITA), apa pun statusnya, termasuk yang dibatalkan.
     */
    public function scopeNotEnded(Builder $query): Builder
    {
        $now = now();

        return $query->where(fn (Builder $query) => $query
            ->whereDate('schedule_date', '>', $now->toDateString())
            ->orWhere(fn (Builder $query) => $query
                ->whereDate('schedule_date', $now->toDateString())
                ->where('end_time', '>', $now->format('H:i:s'))));
    }

    /**
     * Jadwal instruktur yang bertumpuk dengan rentang jam pada tanggal itu. Jadwal yang dibatalkan tidak dihitung.
     * Jam yang hanya bersentuhan (selesai 08:00, mulai 08:00) tidak dianggap bertumpuk.
     * Jam dibandingkan sebagai teks HH:MM:SS, jadi keduanya harus disimpan dengan detik.
     */
    public function scopeOverlapping(Builder $query, int $instructorId, string $date, string $startTime, string $endTime): Builder
    {
        return $query
            ->where('instructor_id', $instructorId)
            ->whereDate('schedule_date', $date)
            ->where('status', '!=', self::STATUS_CANCELLED)
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime);
    }

    /**
     * Relasi dan hitungan yang dibutuhkan ClassScheduleResource.
     * participants_count hanya menghitung peserta yang tidak membatalkan booking.
     */
    public function scopeWithDetails(Builder $query): Builder
    {
        return $query->with(['gymClass', 'instructor'])->withParticipantsCount();
    }

    /**
     * Hanya participants_count (peserta yang tidak membatalkan booking), dihitung lewat subquery tanpa N+1.
     */
    public function scopeWithParticipantsCount(Builder $query): Builder
    {
        return $query->withCount(self::participantsCountDefinition());
    }

    /**
     * Jadwal dengan schedule_date di antara dua tanggal (inklusif).
     */
    public function scopeBetweenDates(Builder $query, CarbonInterface $from, CarbonInterface $to): Builder
    {
        return $query
            ->whereDate('schedule_date', '>=', $from->toDateString())
            ->whereDate('schedule_date', '<=', $to->toDateString());
    }

    /**
     * Urutan tampil jadwal: tanggal, jam mulai, lalu id agar stabil.
     */
    public function scopeChronological(Builder $query): Builder
    {
        return $query->orderBy('schedule_date')->orderBy('start_time')->orderBy('id');
    }

    /**
     * Versi scopeWithDetails() untuk model yang sudah diambil (mis. setelah dibuat atau diubah).
     */
    public function loadDetails(): static
    {
        return $this->load(['gymClass', 'instructor'])->loadCount(self::participantsCountDefinition());
    }

    /**
     * @return array<string, \Closure>
     */
    private static function participantsCountDefinition(): array
    {
        return ['participants as participants_count' => fn (Builder $query) => $query->where('status', '!=', ClassParticipant::STATUS_CANCELLED)];
    }

    /**
     * Waktu mulai sesi dalam zona waktu aplikasi (WITA).
     */
    public function startsAt(): CarbonImmutable
    {
        return CarbonImmutable::parse($this->schedule_date->format('Y-m-d').' '.$this->start_time);
    }

    /**
     * Sesi dianggap sudah dimulai tepat pada jam mulainya (WITA).
     */
    public function hasStarted(): bool
    {
        return ! $this->startsAt()->isFuture();
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
