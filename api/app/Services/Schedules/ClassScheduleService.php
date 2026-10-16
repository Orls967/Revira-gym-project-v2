<?php

namespace App\Services\Schedules;

use App\Models\ClassSchedule;
use App\Models\Instructor;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Pembuatan, perubahan, dan transisi status jadwal kelas (SCRUM-55).
 *
 * Cek tumpang tindih dan penyimpanan berjalan dalam satu transaksi dengan baris instruktur dikunci,
 * agar dua request bersamaan untuk instruktur yang sama tidak sama-sama lolos.
 */
class ClassScheduleService
{
    /**
     * Status tujuan yang diizinkan dari tiap status. completed adalah status akhir.
     *
     * @var array<string, list<string>>
     */
    public const TRANSITIONS = [
        ClassSchedule::STATUS_SCHEDULED => [
            ClassSchedule::STATUS_ONGOING,
            ClassSchedule::STATUS_COMPLETED,
            ClassSchedule::STATUS_CANCELLED,
        ],
        ClassSchedule::STATUS_ONGOING => [
            ClassSchedule::STATUS_COMPLETED,
            ClassSchedule::STATUS_CANCELLED,
        ],
        ClassSchedule::STATUS_CANCELLED => [
            ClassSchedule::STATUS_SCHEDULED,
        ],
        ClassSchedule::STATUS_COMPLETED => [],
    ];

    /**
     * @param  array{class_id: int, instructor_id: int, schedule_date: string, start_time: string, end_time: string}  $data
     */
    public function create(array $data): ClassSchedule
    {
        return DB::transaction(function () use ($data) {
            $schedule = new ClassSchedule(['status' => ClassSchedule::STATUS_SCHEDULED]);
            $schedule->fill($this->normalizeTimes($data));

            $this->ensureNoOverlap($schedule, 'instructor_id');
            $schedule->save();

            return $schedule;
        });
    }

    /**
     * @param  array{class_id: int, instructor_id: int, schedule_date: string, start_time: string, end_time: string}  $data
     */
    public function update(ClassSchedule $schedule, array $data): ClassSchedule
    {
        return DB::transaction(function () use ($schedule, $data) {
            $schedule->fill($this->normalizeTimes($data));

            // Peserta mem-booking kelas tertentu; mengganti kelas akan memindahkan mereka ke kelas lain.
            // Termasuk peserta yang sudah membatalkan booking, agar riwayatnya tetap menunjuk kelas yang benar.
            if ($schedule->isDirty('class_id') && $schedule->participants()->exists()) {
                throw ValidationException::withMessages([
                    'class_id' => 'Kelas jadwal tidak dapat diganti karena jadwal sudah memiliki peserta. Batalkan jadwal ini lalu buat jadwal baru untuk kelas lain.',
                ]);
            }

            $this->ensureNoOverlap($schedule, 'instructor_id');
            $schedule->save();

            return $schedule;
        });
    }

    /**
     * @throws ValidationException bila transisi tidak diizinkan
     */
    public function changeStatus(ClassSchedule $schedule, string $status, ?string $cancelReason): ClassSchedule
    {
        return DB::transaction(function () use ($schedule, $status, $cancelReason) {
            $from = $schedule->status;

            if ($from === $status) {
                $this->fail("Jadwal sudah berstatus {$status}.");
            }

            if (! in_array($status, self::TRANSITIONS[$from] ?? [], true)) {
                $this->fail("Status jadwal tidak dapat diubah dari {$from} ke {$status}.");
            }

            $startsAt = $schedule->startsAt();

            if (in_array($status, [ClassSchedule::STATUS_ONGOING, ClassSchedule::STATUS_COMPLETED], true) && $startsAt->isFuture()) {
                $this->fail("Jadwal belum dimulai, sehingga belum dapat diubah ke {$status}.");
            }

            if ($status === ClassSchedule::STATUS_SCHEDULED) {
                $this->ensureCanBeRescheduled($schedule);
            }

            $schedule->status = $status;
            $schedule->cancel_reason = $status === ClassSchedule::STATUS_CANCELLED ? $cancelReason : null;
            $schedule->save();

            return $schedule;
        });
    }

    /**
     * Jadwal batal hanya bisa diaktifkan lagi bila belum lewat waktu mulai, kelas dan instrukturnya masih aktif,
     * dan slot instruktur belum terisi jadwal lain selama jadwal ini batal.
     */
    private function ensureCanBeRescheduled(ClassSchedule $schedule): void
    {
        if (! $schedule->startsAt()->isFuture()) {
            $this->fail('Jadwal yang dibatalkan hanya dapat diaktifkan kembali sebelum waktu mulai.');
        }

        if (! $schedule->gymClass()->where('is_active', true)->exists()) {
            $this->fail('Kelas jadwal ini sudah nonaktif. Aktifkan kelas lebih dulu.');
        }

        if (! $schedule->instructor()->where('is_active', true)->exists()) {
            $this->fail('Instruktur jadwal ini sudah nonaktif. Ganti instruktur atau aktifkan kembali lebih dulu.');
        }

        $this->ensureNoOverlap($schedule, 'status');
    }

    /**
     * Menolak 422 bila instruktur sudah punya jadwal lain (bukan batal) yang jamnya bertumpuk di tanggal yang sama.
     */
    private function ensureNoOverlap(ClassSchedule $schedule, string $errorKey): void
    {
        // Kunci baris instruktur sampai transaksi selesai; SQLite (tes) mengabaikan klausa ini
        Instructor::whereKey($schedule->instructor_id)->lockForUpdate()->first();

        $date = $schedule->schedule_date->format('Y-m-d');

        $conflict = ClassSchedule::query()
            ->overlapping($schedule->instructor_id, $date, $schedule->start_time, $schedule->end_time)
            ->when($schedule->exists, fn ($query) => $query->whereKeyNot($schedule->getKey()))
            ->orderBy('start_time')
            ->first();

        if ($conflict) {
            $from = substr($conflict->start_time, 0, 5);
            $to = substr($conflict->end_time, 0, 5);

            throw ValidationException::withMessages([
                $errorKey => "Instruktur sudah memiliki jadwal lain pada {$date} pukul {$from}-{$to} yang bertumpuk dengan jadwal ini.",
            ]);
        }
    }

    /**
     * Jam disimpan sebagai HH:MM:SS agar perbandingan teks di scopeOverlapping konsisten di MySQL dan SQLite.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeTimes(array $data): array
    {
        foreach (['start_time', 'end_time'] as $field) {
            $data[$field] = substr($data[$field], 0, 5).':00';
        }

        return $data;
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['status' => $message]);
    }
}
