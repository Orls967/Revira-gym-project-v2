<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('memberships', function (Blueprint $table) {
            $table->date('start_date')->nullable()->change();
            $table->enum('status', [
                'pending',
                'active',
                'expired',
                'rejected',
            ])->default('pending')->change();
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->enum('verification_status', [
                'pending',
                'verified',
                'rejected',
            ])->default('pending')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Tangani data yang memiliki start_date NULL sebelum dikembalikan ke NOT NULL
        // untuk mencegah SQL error 'Invalid use of NULL value' pada MySQL/MariaDB.
        DB::table('memberships')
            ->whereNull('start_date')
            ->update(['start_date' => now()->toDateString()]);

        Schema::table('memberships', function (Blueprint $table) {
            $table->date('start_date')->nullable(false)->change();
            $table->enum('status', [
                'pending',
                'active',
                'expired',
                'rejected',
            ])->default(null)->change();
        });

        Schema::table('transactions', function (Blueprint $table) {
            $table->enum('verification_status', [
                'pending',
                'verified',
                'rejected',
            ])->default(null)->change();
        });
    }
};
