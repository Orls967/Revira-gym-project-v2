<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('memberships', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')
                ->constrained('users')
                ->restrictOnDelete();

            $table->foreignId('membership_plan_id')
                ->constrained('membership_plans')
                ->restrictOnDelete();

            $table->enum('record_type', ['registration', 'extension']);
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->enum('status', [
                'pending',
                'active',
                'expired',
                'rejected',
            ]);

            $table->index(['user_id', 'status']);

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('memberships');
    }
};