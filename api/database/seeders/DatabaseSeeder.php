<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing', 'staging'])) {
            abort(403, 'Seeding is only allowed in local, testing, or staging environments.');
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
