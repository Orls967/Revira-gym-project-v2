<?php

namespace Database\Seeders;

use App\Models\MembershipPlan;
use Illuminate\Database\Seeder;

class MembershipPlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'name' => 'Paket Bulanan (30 Hari)',
                'duration_days' => 30,
                'price' => 150000.00,
                'description' => 'Akses penuh seluruh fasilitas gym selama 30 hari.',
                'is_active' => true,
            ],
            [
                'name' => 'Paket Triwulan (90 Hari)',
                'duration_days' => 90,
                'price' => 400000.00,
                'description' => 'Akses penuh seluruh fasilitas gym selama 90 hari.',
                'is_active' => true,
            ],
            [
                'name' => 'Paket Tahunan (365 Hari)',
                'duration_days' => 365,
                'price' => 1500000.00,
                'description' => 'Akses penuh seluruh fasilitas gym selama 1 tahun penuh.',
                'is_active' => true,
            ],
        ];

        foreach ($plans as $plan) {
            MembershipPlan::updateOrCreate(
                ['name' => $plan['name']],
                $plan
            );
        }
    }
}
