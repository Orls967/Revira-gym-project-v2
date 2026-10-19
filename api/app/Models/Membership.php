<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class Membership extends Model
{
    use HasFactory;

    protected $attributes = [
        'status' => 'pending',
    ];

    protected $fillable = [
        'user_id',
        'membership_plan_id',
        'record_type',
        'start_date',
        'end_date',
        'status',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    /**
     * Membership yang sedang berlaku hari ini (WITA). Lihat scopeActiveOn().
     */
    public function scopeCurrentlyActive(Builder $query): void
    {
        $query->activeOn(today());
    }

    /**
     * Membership yang berlaku pada tanggal tertentu: status active dan start_date <= tanggal <= end_date (B6, SCRUM-71).
     * start_date dicek supaya perpanjangan yang belum mulai tidak membuat member aktif lebih awal;
     * end_date dicek supaya tetap benar walau job yang mengubah status ke expired belum jalan.
     */
    public function scopeActiveOn(Builder $query, CarbonInterface|string $date): void
    {
        $date = Carbon::parse($date)->toDateString();

        $query->where('status', 'active')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date);
    }

    /**
     * Membership active yang sudah disetujui tetapi baru mulai setelah hari ini (mis. perpanjangan).
     */
    public function scopeUpcoming(Builder $query): void
    {
        $query->where('status', 'active')
            ->whereDate('start_date', '>', today());
    }

    /**
     * Membership active yang periodenya beririsan dengan rentang tanggal (inklusif).
     * Dipakai untuk menjaga aturan B6: membership active milik satu user tidak boleh tumpang tindih.
     */
    public function scopeOverlapping(Builder $query, CarbonInterface|string $startDate, CarbonInterface|string $endDate): void
    {
        $query->where('status', 'active')
            ->whereDate('start_date', '<=', Carbon::parse($endDate)->toDateString())
            ->whereDate('end_date', '>=', Carbon::parse($startDate)->toDateString());
    }

    /**
     * Get the user who owns this membership.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the membership plan.
     */
    public function membershipPlan()
    {
        return $this->belongsTo(MembershipPlan::class);
    }

    /**
     * Get the transactions for this membership.
     */
    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }
}
