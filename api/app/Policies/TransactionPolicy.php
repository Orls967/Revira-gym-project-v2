<?php

namespace App\Policies;

use App\Enums\UserRole;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Otorisasi akses transaksi (dan bukti transfernya): admin atau pemilik transaksi.
 */
class TransactionPolicy
{
    /**
     * Admin boleh melihat semua transaksi, member hanya miliknya sendiri.
     */
    public function view(User $user, Transaction $transaction): Response
    {
        if ($user->role === UserRole::Admin || $transaction->user_id === $user->id) {
            return Response::allow();
        }

        return Response::deny('Anda tidak memiliki akses ke sumber daya ini.');
    }
}
