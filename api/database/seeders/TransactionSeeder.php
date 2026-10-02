<?php

namespace Database\Seeders;

use App\Models\Membership;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Seeder;

class TransactionSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('email', 'admin@revira.test')->first();
        $memberships = Membership::all();

        foreach ($memberships as $membership) {
            $amount = $membership->membershipPlan->price;

            if ($membership->status === 'active') {
                Transaction::updateOrCreate(
                    ['membership_id' => $membership->id],
                    [
                        'user_id' => $membership->user_id,
                        'amount' => $amount,
                        'payment_method' => 'transfer',
                        'receipt_image' => 'receipts/transfer_'.$membership->id.'.jpg',
                        'verification_status' => 'verified',
                        'verified_by' => $admin->id,
                        'verified_at' => now(),
                        'reject_reason' => null,
                    ]
                );
            } elseif ($membership->status === 'pending') {
                Transaction::updateOrCreate(
                    ['membership_id' => $membership->id],
                    [
                        'user_id' => $membership->user_id,
                        'amount' => $amount,
                        'payment_method' => 'transfer',
                        'receipt_image' => 'receipts/dummy_transfer_pending.jpg',
                        'verification_status' => 'pending',
                        'verified_by' => null,
                        'verified_at' => null,
                        'reject_reason' => null,
                    ]
                );
            } elseif ($membership->status === 'expired') {
                Transaction::updateOrCreate(
                    ['membership_id' => $membership->id],
                    [
                        'user_id' => $membership->user_id,
                        'amount' => $amount,
                        'payment_method' => 'on_the_spot',
                        'receipt_image' => null,
                        'verification_status' => 'verified',
                        'verified_by' => $admin->id,
                        'verified_at' => now()->subDays(60),
                        'reject_reason' => null,
                    ]
                );
            } elseif ($membership->status === 'rejected') {
                Transaction::updateOrCreate(
                    ['membership_id' => $membership->id],
                    [
                        'user_id' => $membership->user_id,
                        'amount' => $amount,
                        'payment_method' => 'transfer',
                        'receipt_image' => 'receipts/dummy_invalid_transfer.jpg',
                        'verification_status' => 'rejected',
                        'verified_by' => $admin->id,
                        'verified_at' => now()->subDays(5),
                        'reject_reason' => 'Bukti transfer tidak terbaca / nominal tidak sesuai.',
                    ]
                );
            }
        }
    }
}
