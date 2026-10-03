<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
     * Membership yang sedang berlaku: status active dan end_date belum lewat.
     * end_date ikut dicek supaya tetap benar walau job yang mengubah status ke expired belum jalan.
     */
    public function scopeCurrentlyActive(Builder $query): void
    {
        $query->where('status', 'active')
            ->whereDate('end_date', '>=', today());
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
