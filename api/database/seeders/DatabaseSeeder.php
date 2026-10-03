<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing', 'staging'])) {
            throw new RuntimeException('Seeding is only allowed in local, testing, or staging environments.');
        }

        if (! app()->environment(['local', 'testing'])) {
            $seedPassword = config('seeding.password');
            if (empty($seedPassword) || $seedPassword === 'password') {
                throw new RuntimeException('SEED_PASSWORD must be set to a secure non-default value in staging environment.');
            }
        }

        $this->call([
            UserSeeder::class,
            MembershipPlanSeeder::class,
            MembershipSeeder::class,
            TransactionSeeder::class,
            OperationalHourSeeder::class,
            InstructorSeeder::class,
            ClassSeeder::class,
            ClassScheduleSeeder::class,
            ClassParticipantSeeder::class,
        ]);
    }
}
