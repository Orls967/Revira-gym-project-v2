<?php

namespace App\Services\Bookings;

use App\Exceptions\BookingConflictException;
use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\User;
use App\Services\Memberships\MembershipStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Booking dan pembatalan booking sesi kelas oleh member (SCRUM-70, aturan B7 dan B8 di SCRUM-25).
 *
 * Baris jadwal dikunci (lockForUpdate) selama transaksi supaya request bersamaan untuk sesi yang sama
 * diproses bergantian. Kelas tidak punya kapasitas maksimum, jadi tidak ada cek "kelas penuh".
 * Setiap simpan peserta memperbarui updated_at jadwal ($touches di ClassParticipant), sehingga
 * participants_count yang berubah ikut terbaca polling GET /class-schedules/status (SCRUM-56).
 */
class BookingService
{
    /** Key error 422 untuk semua pelanggaran aturan booking. */
    public const ERROR_KEY = 'booking';

    public function __construct(private readonly MembershipStatus $membershipStatus) {}

    /**
     * Booking sesi. Baris lama yang pernah dibatalkan diaktifkan kembali (UNIQUE class_schedule_id, user_id).
     *
     * @throws ValidationException 422 bila sesi tidak bisa dibooking atau member tidak aktif pada tanggal sesi
     * @throws BookingConflictException 409 bila member sudah booking sesi ini
     */
    public function book(User $user, ClassSchedule $schedule): ClassParticipant
    {
        return DB::transaction(function () use ($user, $schedule) {
            $schedule = $this->lockSchedule($schedule);

            if ($schedule->status !== ClassSchedule::STATUS_SCHEDULED) {
                $this->fail($schedule->status === ClassSchedule::STATUS_CANCELLED
                    ? 'Sesi kelas ini sudah dibatalkan.'
                    : 'Sesi kelas ini sudah dimulai atau selesai.');
            }

            if ($schedule->hasStarted()) {
                $this->fail('Sesi kelas ini sudah dimulai atau sudah lewat.');
            }

            $participant = $schedule->participants()->where('user_id', $user->id)->first();

            if ($participant && $participant->status !== ClassParticipant::STATUS_CANCELLED) {
                throw new BookingConflictException;
            }

            $this->membershipStatus->ensureActiveOn($user, $schedule->schedule_date, self::ERROR_KEY);

            $participant ??= new ClassParticipant([
                'class_schedule_id' => $schedule->id,
                'user_id' => $user->id,
            ]);
            $participant->status = ClassParticipant::STATUS_BOOKED;
            $participant->booked_at = now();
            $participant->save();

            return $participant;
        });
    }

    /**
     * Batalkan booking milik member sendiri sebelum sesi dimulai. Baris tidak dihapus, hanya status cancelled.
     *
     * @throws NotFoundHttpException 404 bila member tidak punya booking di sesi ini
     * @throws ValidationException 422 bila booking sudah dibatalkan atau sesi sudah dimulai
     */
    public function cancel(User $user, ClassSchedule $schedule): ClassParticipant
    {
        return DB::transaction(function () use ($user, $schedule) {
            $schedule = $this->lockSchedule($schedule);

            $participant = $schedule->participants()->where('user_id', $user->id)->first();

            if (! $participant) {
                throw new NotFoundHttpException('Booking tidak ditemukan.');
            }

            if ($participant->status === ClassParticipant::STATUS_CANCELLED) {
                $this->fail('Booking ini sudah dibatalkan.');
            }

            if ($participant->status !== ClassParticipant::STATUS_BOOKED || $schedule->hasStarted()) {
                $this->fail('Booking tidak dapat dibatalkan karena sesi kelas sudah dimulai.');
            }

            $participant->status = ClassParticipant::STATUS_CANCELLED;
            $participant->save();

            return $participant;
        });
    }

    /**
     * Ambil ulang jadwal dengan baris terkunci sampai transaksi selesai; SQLite (tes) mengabaikan klausa ini.
     */
    private function lockSchedule(ClassSchedule $schedule): ClassSchedule
    {
        return ClassSchedule::whereKey($schedule->getKey())->lockForUpdate()->firstOrFail();
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages([self::ERROR_KEY => $message]);
    }
}
