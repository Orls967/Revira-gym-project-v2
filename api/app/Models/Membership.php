<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Membership extends Model
{
    use HasFactory;

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