<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'membership_id',
        'user_id',
        'amount',
        'payment_method',
        'receipt_image',
        'verification_status',
        'verified_by',
        'verified_at',
        'reject_reason',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'verified_at' => 'datetime',
    ];

    /**
     * Get the membership associated with this transaction.
     */
    public function membership()
    {
        return $this->belongsTo(Membership::class);
    }

    /**
     * Get the user who made the payment.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the user who verified this transaction.
     */
    public function verifier()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
