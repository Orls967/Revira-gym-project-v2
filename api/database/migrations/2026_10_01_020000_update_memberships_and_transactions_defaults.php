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
        $lengthFunc = DB::getDriverName() === 'sqlite' ? 'LENGTH' : 'CHAR_LENGTH';
        $longReasonsCount = DB::table('transactions')
            ->whereNotNull('reject_reason')
            ->whereRaw("{$lengthFunc}(reject_reason) > 255")
            ->count();

        if ($longReasonsCount > 0) {
            throw new RuntimeException("Tabel 'transactions', kolom 'reject_reason' memuat {$longReasonsCount} baris data dengan panjang melebihi 255 karakter. Migrasi dibatalkan untuk mencegah pemotongan data.");
        }

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
            $table->string('reject_reason', 255)->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Perhatian: Mengubah data yang sudah ada.
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
            $table->text('reject_reason')->nullable()->change();
        });
    }
};
