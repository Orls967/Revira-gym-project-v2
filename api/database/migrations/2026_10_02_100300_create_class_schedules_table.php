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
        Schema::create('class_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('class_id')
                ->constrained('classes')
                ->restrictOnDelete();
            $table->foreignId('instructor_id')
                ->constrained('instructors')
                ->restrictOnDelete();
            $table->date('schedule_date');
            $table->time('start_time');
            $table->time('end_time');
            $table->enum('status', [
                'scheduled', 'ongoing', 'completed', 'cancelled',
            ])->default('scheduled');
            $table->string('cancel_reason', 255)->nullable();
            $table->index(['schedule_date', 'status']);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('class_schedules');
    }
};
