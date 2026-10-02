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
        Schema::create('class_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('class_schedule_id')
                ->constrained('class_schedules')
                ->restrictOnDelete();
            $table->foreignId('user_id')
                ->constrained('users')
                ->restrictOnDelete();
            $table->enum('status', [
                'booked', 'attended', 'cancelled',
            ])->default('booked');
            $table->timestamp('booked_at');
            $table->unique(['class_schedule_id', 'user_id']);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('class_participants');
    }
};
