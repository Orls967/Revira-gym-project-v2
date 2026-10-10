<?php

namespace Database\Factories;

use App\Models\Membership;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Transaction>
 */
class TransactionFactory extends Factory
{
    protected $model = Transaction::class;

    public function definition(): array
    {
        return [
            'membership_id' => Membership::factory(),
            'user_id' => fn (array $attributes) => Membership::find($attributes['membership_id'])?->user_id ?? User::factory(),
            'amount' => 150000.00,
            'payment_method' => fake()->randomElement(['transfer', 'on_the_spot']),
            'receipt_image' => null,
            'verification_status' => 'verified',
            'verified_by' => null,
            'verified_at' => now(),
            'reject_reason' => null,
        ];
    }

    public function pending(): static
    {
        return $this->state(fn () => [
            'payment_method' => 'transfer',
            'receipt_image' => 'receipts/dummy_transfer.jpg',
            'verification_status' => 'pending',
            'verified_by' => null,
            'verified_at' => null,
            'reject_reason' => null,
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => [
            'verification_status' => 'rejected',
            'verified_at' => now(),
            'reject_reason' => 'Bukti pembayaran tidak valid.',
        ]);
    }
}
