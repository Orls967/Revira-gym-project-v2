<?php

namespace App\Services\Transactions;

use App\Exceptions\TransactionConflictException;
use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class TransactionVerificationService
{
    /**
     * Menyetujui transaksi membership (B4, SCRUM-67).
     *
     * @throws TransactionConflictException bila transaksi sudah diproses atau periode bertabrakan (409)
     */
    public function approve(Transaction $transaction, User $admin): Transaction
    {
        return DB::transaction(function () use ($transaction, $admin) {
            /** @var Transaction $lockedTransaction */
            $lockedTransaction = Transaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();

            /** @var Membership $lockedMembership */
            $lockedMembership = Membership::whereKey($lockedTransaction->membership_id)->lockForUpdate()->firstOrFail();

            if ($lockedTransaction->verification_status !== 'pending') {
                throw TransactionConflictException::forTransactionStatus($lockedTransaction->verification_status);
            }

            if ($lockedMembership->status !== 'pending') {
                throw TransactionConflictException::forMembershipStatus($lockedMembership->status);
            }

            /** @var MembershipPlan $plan */
            $plan = $lockedMembership->membershipPlan()->firstOrFail();

            $today = Carbon::today(config('app.timezone'));

            $startDate = $lockedMembership->start_date
                ? Carbon::parse($lockedMembership->start_date->toDateString(), config('app.timezone'))
                : null;

            if ($startDate === null || $startDate->lt($today)) {
                $startDate = $today->copy();
            }

            $durationDays = (int) $plan->duration_days;
            $endDate = $startDate->copy()->addDays($durationDays - 1);

            // B3: cek membership LAIN milik user yang sama berstatus active dan tumpang tindih
            $hasOverlap = Membership::query()
                ->where('user_id', $lockedMembership->user_id)
                ->where('id', '!=', $lockedMembership->id)
                ->where('status', 'active')
                ->whereDate('start_date', '<=', $endDate->toDateString())
                ->whereDate('end_date', '>=', $startDate->toDateString())
                ->lockForUpdate()
                ->exists();

            if ($hasOverlap) {
                throw new TransactionConflictException('Periode membership bertabrakan dengan masa aktif lain milik member ini.');
            }

            $lockedMembership->update([
                'status' => 'active',
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
            ]);

            $lockedTransaction->update([
                'verification_status' => 'verified',
                'verified_by' => $admin->id,
                'verified_at' => now(),
                'reject_reason' => null,
            ]);

            return $lockedTransaction->load(['user', 'membership.membershipPlan']);
        });
    }

    /**
     * Menolak transaksi membership dengan alasan penolakan (B5, SCRUM-67).
     *
     * @throws TransactionConflictException bila transaksi sudah diproses (409)
     */
    public function reject(Transaction $transaction, User $admin, string $reason): Transaction
    {
        return DB::transaction(function () use ($transaction, $admin, $reason) {
            /** @var Transaction $lockedTransaction */
            $lockedTransaction = Transaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();

            /** @var Membership $lockedMembership */
            $lockedMembership = Membership::whereKey($lockedTransaction->membership_id)->lockForUpdate()->firstOrFail();

            if ($lockedTransaction->verification_status !== 'pending') {
                throw TransactionConflictException::forTransactionStatus($lockedTransaction->verification_status);
            }

            if ($lockedMembership->status !== 'pending') {
                throw TransactionConflictException::forMembershipStatus($lockedMembership->status);
            }

            $lockedMembership->update([
                'status' => 'rejected',
            ]);

            $lockedTransaction->update([
                'verification_status' => 'rejected',
                'reject_reason' => trim($reason),
                'verified_by' => $admin->id,
                'verified_at' => now(),
            ]);

            return $lockedTransaction->load(['user', 'membership.membershipPlan']);
        });
    }
}
