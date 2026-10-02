<?php

namespace Database\Seeders;

use App\Models\Membership;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

class TransactionSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('email', 'admin@revira.test')->first();

        $member1 = User::where('email', 'member1@revira.test')->first();
        $member2 = User::where('email', 'member2@revira.test')->first();
        $member3 = User::where('email', 'member3@revira.test')->first();
        $member4 = User::where('email', 'member4@revira.test')->first();
        $member5 = User::where('email', 'member5@revira.test')->first();

        $m1 = $member1 ? Membership::where('user_id', $member1->id)->where('record_type', 'registration')->first() : null;
        $m2 = $member2 ? Membership::where('user_id', $member2->id)->where('record_type', 'registration')->first() : null;
        $m3Reg = $member3 ? Membership::where('user_id', $member3->id)->where('record_type', 'registration')->first() : null;
        $m3Ext = $member3 ? Membership::where('user_id', $member3->id)->where('record_type', 'extension')->first() : null;
        $m4 = $member4 ? Membership::where('user_id', $member4->id)->where('record_type', 'registration')->first() : null;
        $m5 = $member5 ? Membership::where('user_id', $member5->id)->where('record_type', 'registration')->first() : null;

        // 1. Member 1: Active membership, verified transfer
        if ($m1) {
            Transaction::updateOrCreate(
                ['membership_id' => $m1->id],
                [
                    'user_id' => $m1->user_id,
                    'amount' => $m1->membershipPlan->price,
                    'payment_method' => 'transfer',
                    'receipt_image' => 'receipts/transfer_'.$m1->id.'.jpg',
                    'verification_status' => 'verified',
                    'verified_by' => $admin?->id,
                    'verified_at' => now(),
                    'reject_reason' => null,
                ]
            );
        }

        // 2. Member 2: Pending membership, pending transfer
        if ($m2) {
            Transaction::updateOrCreate(
                ['membership_id' => $m2->id],
                [
                    'user_id' => $m2->user_id,
                    'amount' => $m2->membershipPlan->price,
                    'payment_method' => 'transfer',
                    'receipt_image' => 'receipts/dummy_transfer_pending.jpg',
                    'verification_status' => 'pending',
                    'verified_by' => null,
                    'verified_at' => null,
                    'reject_reason' => null,
                ]
            );
        }

        // 3. Member 3: Expired membership, verified on-the-spot
        if ($m3Reg) {
            Transaction::updateOrCreate(
                ['membership_id' => $m3Reg->id],
                [
                    'user_id' => $m3Reg->user_id,
                    'amount' => $m3Reg->membershipPlan->price,
                    'payment_method' => 'on_the_spot',
                    'receipt_image' => null,
                    'verification_status' => 'verified',
                    'verified_by' => $admin?->id,
                    'verified_at' => now()->subDays(60),
                    'reject_reason' => null,
                ]
            );
        }

        // 4. Member 3: Extension attempt, rejected transfer
        if ($m3Ext) {
            Transaction::updateOrCreate(
                ['membership_id' => $m3Ext->id],
                [
                    'user_id' => $m3Ext->user_id,
                    'amount' => $m3Ext->membershipPlan->price,
                    'payment_method' => 'transfer',
                    'receipt_image' => 'receipts/dummy_invalid_transfer.jpg',
                    'verification_status' => 'rejected',
                    'verified_by' => $admin?->id,
                    'verified_at' => now()->subDays(5),
                    'reject_reason' => 'Bukti transfer tidak terbaca / nominal tidak sesuai.',
                ]
            );
        }

        // 5. Member 4: Active membership, verified transfer
        if ($m4) {
            Transaction::updateOrCreate(
                ['membership_id' => $m4->id],
                [
                    'user_id' => $m4->user_id,
                    'amount' => $m4->membershipPlan->price,
                    'payment_method' => 'transfer',
                    'receipt_image' => 'receipts/transfer_'.$m4->id.'.jpg',
                    'verification_status' => 'verified',
                    'verified_by' => $admin?->id,
                    'verified_at' => now()->subDays(5),
                    'reject_reason' => null,
                ]
            );
        }

        // 6. Member 5: Active membership, verified transfer
        if ($m5) {
            Transaction::updateOrCreate(
                ['membership_id' => $m5->id],
                [
                    'user_id' => $m5->user_id,
                    'amount' => $m5->membershipPlan->price,
                    'payment_method' => 'transfer',
                    'receipt_image' => 'receipts/transfer_'.$m5->id.'.jpg',
                    'verification_status' => 'verified',
                    'verified_by' => $admin?->id,
                    'verified_at' => now()->subDays(10),
                    'reject_reason' => null,
                ]
            );
        }

        // Salin dummy asset receipt ke public disk bila belum ada
        $assetSource = database_path('seeders/assets/dummy_transfer_pending.jpg');
        if (file_exists($assetSource)) {
            $pathsToEnsure = [
                'receipts/dummy_transfer_pending.jpg',
                'receipts/dummy_invalid_transfer.jpg',
            ];
            if ($m1) {
                $pathsToEnsure[] = 'receipts/transfer_'.$m1->id.'.jpg';
            }
            if ($m4) {
                $pathsToEnsure[] = 'receipts/transfer_'.$m4->id.'.jpg';
            }
            if ($m5) {
                $pathsToEnsure[] = 'receipts/transfer_'.$m5->id.'.jpg';
            }

            foreach ($pathsToEnsure as $relativePath) {
                if (! Storage::disk('public')->exists($relativePath)) {
                    Storage::disk('public')->put($relativePath, file_get_contents($assetSource));
                }
            }
        }
    }
}
