<?php

namespace Database\Seeders;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\User;
use Illuminate\Database\Seeder;

class MembershipSeeder extends Seeder
{
    public function run(): void
    {
        $plan30 = MembershipPlan::where('duration_days', 30)->first();
        $plan90 = MembershipPlan::where('duration_days', 90)->first();

        $member1 = User::where('email', 'member1@revira.test')->first();
        $member2 = User::where('email', 'member2@revira.test')->first();
        $member3 = User::where('email', 'member3@revira.test')->first();
        $member4 = User::where('email', 'member4@revira.test')->first();
        $member5 = User::where('email', 'member5@revira.test')->first();

        $today = now('Asia/Makassar')->startOfDay();

        // 1. Active membership (H-3 expiry for reminder testing)
        Membership::updateOrCreate(
            [
                'user_id' => $member1->id,
                'record_type' => 'registration',
            ],
            [
                'membership_plan_id' => $plan30->id,
                'start_date' => $today->copy()->subDays(27)->toDateString(),
                'end_date' => $today->copy()->addDays(3)->toDateString(),
                'status' => 'active',
            ]
        );

        // 2. Pending membership
        Membership::updateOrCreate(
            [
                'user_id' => $member2->id,
                'record_type' => 'registration',
            ],
            [
                'membership_plan_id' => $plan30->id,
                'start_date' => null,
                'end_date' => null,
                'status' => 'pending',
            ]
        );

        // 3. Expired membership
        Membership::updateOrCreate(
            [
                'user_id' => $member3->id,
                'record_type' => 'registration',
            ],
            [
                'membership_plan_id' => $plan30->id,
                'start_date' => $today->copy()->subDays(60)->toDateString(),
                'end_date' => $today->copy()->subDays(30)->toDateString(),
                'status' => 'expired',
            ]
        );

        // 4. Rejected membership (extension attempt)
        Membership::updateOrCreate(
            [
                'user_id' => $member3->id,
                'record_type' => 'extension',
            ],
            [
                'membership_plan_id' => $plan90->id,
                'start_date' => null,
                'end_date' => null,
                'status' => 'rejected',
            ]
        );

        // 5. Active membership for member4
        Membership::updateOrCreate(
            [
                'user_id' => $member4->id,
                'record_type' => 'registration',
            ],
            [
                'membership_plan_id' => $plan30->id,
                'start_date' => $today->copy()->subDays(5)->toDateString(),
                'end_date' => $today->copy()->addDays(25)->toDateString(),
                'status' => 'active',
            ]
        );

        // 6. Active membership for member5
        Membership::updateOrCreate(
            [
                'user_id' => $member5->id,
                'record_type' => 'registration',
            ],
            [
                'membership_plan_id' => $plan30->id,
                'start_date' => $today->copy()->subDays(10)->toDateString(),
                'end_date' => $today->copy()->addDays(20)->toDateString(),
                'status' => 'active',
            ]
        );
    }
}
