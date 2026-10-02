<?php

namespace Tests\Feature\Database;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class CoreSchemaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::getDriverName() === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON;');
        }
    }

    public function test_core_tables_and_columns_exist(): void
    {
        $this->assertTrue(Schema::hasTable('users'));
        $this->assertTrue(Schema::hasTable('membership_plans'));
        $this->assertTrue(Schema::hasTable('memberships'));
        $this->assertTrue(Schema::hasTable('transactions'));
        $this->assertTrue(Schema::hasTable('personal_access_tokens'));

        $this->assertTrue(Schema::hasColumns('users', [
            'id', 'name', 'email', 'phone_number', 'password', 'role', 'profile_photo',
        ]));

        $this->assertTrue(Schema::hasColumns('membership_plans', [
            'id', 'name', 'duration_days', 'price', 'description', 'is_active',
        ]));

        $this->assertTrue(Schema::hasColumns('memberships', [
            'id', 'user_id', 'membership_plan_id', 'record_type', 'start_date', 'end_date', 'status',
        ]));

        $this->assertTrue(Schema::hasColumns('transactions', [
            'id', 'membership_id', 'user_id', 'amount', 'payment_method',
            'receipt_image', 'verification_status', 'verified_by', 'verified_at', 'reject_reason',
        ]));
    }

    public function test_users_table_profile_fields_are_nullable(): void
    {
        $user = User::factory()->create([
            'phone_number' => null,
            'profile_photo' => null,
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'phone_number' => null,
            'profile_photo' => null,
        ]);
    }

    public function test_memberships_table_has_user_id_and_status_index(): void
    {
        $this->assertTrue(
            Schema::hasIndex('memberships', ['user_id', 'status'])
        );
    }

    public function test_foreign_keys_have_restrict_on_delete(): void
    {
        $user = User::factory()->create();
        $plan = MembershipPlan::create([
            'name' => 'Monthly Standard',
            'duration_days' => 30,
            'price' => 150000,
            'is_active' => true,
        ]);

        $membership = Membership::create([
            'user_id' => $user->id,
            'membership_plan_id' => $plan->id,
            'record_type' => 'registration',
            'status' => 'pending',
        ]);

        $transaction = Transaction::create([
            'membership_id' => $membership->id,
            'user_id' => $user->id,
            'amount' => 150000,
            'payment_method' => 'transfer',
            'verification_status' => 'pending',
        ]);

        // Restrict on delete: deleting user must fail because of memberships and transactions
        $userDeleteFailed = false;
        try {
            $user->delete();
        } catch (QueryException $e) {
            $userDeleteFailed = true;
        }
        $this->assertTrue($userDeleteFailed, 'User deletion should fail due to restrictOnDelete constraint.');

        // Restrict on delete: deleting plan must fail because of memberships
        $planDeleteFailed = false;
        try {
            $plan->delete();
        } catch (QueryException $e) {
            $planDeleteFailed = true;
        }
        $this->assertTrue($planDeleteFailed, 'Plan deletion should fail due to restrictOnDelete constraint.');

        // Restrict on delete: deleting membership must fail because of transactions
        $membershipDeleteFailed = false;
        try {
            $membership->delete();
        } catch (QueryException $e) {
            $membershipDeleteFailed = true;
        }
        $this->assertTrue($membershipDeleteFailed, 'Membership deletion should fail due to restrictOnDelete constraint.');
    }
}
