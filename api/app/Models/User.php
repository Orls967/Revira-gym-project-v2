<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable([
    'name',
    'email',
    'phone_number',
    'password',
    'profile_photo',
])]
#[Hidden([
    'password',
    'remember_token',
])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the user's memberships.
     */
    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }

    /**
     * Membership yang berlaku hari ini (aturan B6 SCRUM-25, diimplementasikan di SCRUM-71); bila ada dua, yang end_date-nya paling akhir.
     */
    public function currentActiveMembership(): HasOne
    {
        return $this->hasOne(Membership::class)->ofMany(
            ['end_date' => 'max', 'id' => 'max'],
            fn (Builder $query) => $query->activeOn(today()),
        );
    }

    /**
     * Pengajuan terbaru yang menunggu verifikasi (status pending).
     */
    public function awaitingMembership(): HasOne
    {
        return $this->hasOne(Membership::class)->ofMany(
            ['id' => 'max'],
            fn (Builder $query) => $query->awaiting(),
        );
    }

    /**
     * Membership kedaluwarsa dengan end_date paling akhir.
     */
    public function lapsedMembership(): HasOne
    {
        return $this->hasOne(Membership::class)->ofMany(
            ['end_date' => 'max', 'id' => 'max'],
            fn (Builder $query) => $query->lapsed(),
        );
    }

    /**
     * Get the user's transactions.
     */
    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /**
     * Get the transactions verified by this user.
     */
    public function verifiedTransactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'verified_by');
    }

    /**
     * Get the user's class bookings/participations.
     */
    public function classParticipants(): HasMany
    {
        return $this->hasMany(ClassParticipant::class);
    }

    /**
     * Get the notifications sent to this user.
     */
    public function notificationLogs(): HasMany
    {
        return $this->hasMany(NotificationLog::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
        ];
    }
}
