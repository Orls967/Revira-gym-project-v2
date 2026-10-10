<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $seedPassword = config('seeding.password') ?: 'password';
        $password = Hash::make($seedPassword);

        $users = [
            [
                'email' => 'admin@revira.test',
                'name' => 'Admin Revira',
                'phone_number' => '081234567890',
                'role' => UserRole::Admin,
            ],
            [
                'email' => 'member1@revira.test',
                'name' => 'Member Satu',
                'phone_number' => '081234567891',
                'role' => UserRole::Member,
            ],
            [
                'email' => 'member2@revira.test',
                'name' => 'Member Dua',
                'phone_number' => '081234567892',
                'role' => UserRole::Member,
            ],
            [
                'email' => 'member3@revira.test',
                'name' => 'Member Tiga',
                'phone_number' => '081234567893',
                'role' => UserRole::Member,
            ],
            [
                'email' => 'member4@revira.test',
                'name' => 'Member Empat',
                'phone_number' => '081234567894',
                'role' => UserRole::Member,
            ],
            [
                'email' => 'member5@revira.test',
                'name' => 'Member Lima',
                'phone_number' => '081234567895',
                'role' => UserRole::Member,
            ],
        ];

        foreach ($users as $data) {
            $role = $data['role'];
            unset($data['role']);

            $user = User::updateOrCreate(
                ['email' => $data['email']],
                [
                    'name' => $data['name'],
                    'phone_number' => $data['phone_number'],
                    'password' => $password,
                    'email_verified_at' => now(),
                ]
            );

            $user->forceFill(['role' => $role])->save();
        }
    }
}
