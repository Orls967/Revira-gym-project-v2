<?php

namespace App\Services\Memberships;

use App\Models\Membership;
use App\Models\MembershipPlan;
use App\Models\Transaction;
use App\Models\User;
use App\Services\ReceiptStorage;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Menangani logika bisnis pengajuan membership baru atau perpanjangan (SCRUM-69 / SCRUM-103).
 */
class MembershipApplicationService
{
    public function __construct(
        private readonly ReceiptStorage $receiptStorage
    ) {}

    /**
     * Mengajukan membership baru untuk user yang sedang login.
     *
     * @param  array{membership_plan_id: int, start_date: string, payment_method: string}  $data
     * @return array{membership: Membership, transaction: Transaction}
     *
     * @throws ValidationException bila aturan bisnis dilanggar
     */
    public function submit(User $user, array $data, ?UploadedFile $receipt): array
    {
        $plan = MembershipPlan::findOrFail($data['membership_plan_id']);
        $startDate = $data['start_date'];
        $paymentMethod = $data['payment_method'];

        // --- B2: Tolak bila ada pengajuan pending ---
        $this->guardAgainstDuplicatePending($user);

        // --- B3: Tolak bila periode baru bertabrakan dengan membership aktif ---
        $endDate = $this->calculateEndDate($startDate, $plan->duration_days);
        $this->guardAgainstOverlap($user, $startDate, $endDate);

        // --- Simpan file bukti transfer (sebelum DB transaction) ---
        $receiptPath = null;
        if ($paymentMethod === 'transfer' && $receipt !== null) {
            $receiptPath = $this->receiptStorage->store($receipt);
        }

        try {
            $result = DB::transaction(function () use ($user, $plan, $startDate, $endDate, $paymentMethod, $receiptPath) {
                // Kunci baris user terlebih dahulu untuk mencegah race condition pengajuan simultan
                User::whereKey($user->id)->lockForUpdate()->first();

                // Kunci baris memberships user
                $user->memberships()->lockForUpdate()->get();

                // Cek penentu secara atomik di dalam transaksi (B2 & B3) setelah baris terkunci
                $this->guardAgainstDuplicatePending($user);
                $this->guardAgainstOverlap($user, $startDate, $endDate);

                // --- B1: Tentukan record_type ---
                $recordType = $this->determineRecordType($user);

                // --- Buat Membership ---
                $membership = Membership::create([
                    'user_id' => $user->id,
                    'membership_plan_id' => $plan->id,
                    'record_type' => $recordType,
                    'start_date' => $startDate,
                    'end_date' => null,
                    'status' => 'pending',
                ]);

                // --- Buat Transaction ---
                $transaction = Transaction::create([
                    'membership_id' => $membership->id,
                    'user_id' => $user->id,
                    'amount' => $plan->price,
                    'payment_method' => $paymentMethod,
                    'receipt_image' => $receiptPath,
                    'verification_status' => 'pending',
                ]);

                return compact('membership', 'transaction');
            });
        } catch (Throwable $e) {
            // Hapus file yang sudah tersimpan bila DB transaction gagal
            if ($receiptPath !== null) {
                $this->receiptStorage->delete($receiptPath);
            }
            throw $e;
        }

        // Load relasi untuk Resource
        $result['membership']->load('membershipPlan');

        return $result;
    }

    /**
     * Menghitung tanggal akhir periode membership baru (inklusif).
     */
    private function calculateEndDate(string $startDate, int $durationDays): string
    {
        return Carbon::parse($startDate)->addDays($durationDays - 1)->toDateString();
    }

    /**
     * B2: Tolak bila user masih punya membership berstatus pending.
     *
     * @throws ValidationException
     */
    private function guardAgainstDuplicatePending(User $user): void
    {
        $hasPending = $user->memberships()
            ->where('status', 'pending')
            ->exists();

        if ($hasPending) {
            throw ValidationException::withMessages([
                'membership' => ['Masih ada pengajuan yang menunggu verifikasi.'],
            ]);
        }
    }

    /**
     * B3: Tolak bila periode baru bertabrakan dengan membership aktif yang ada.
     * Menggunakan query eksplisit status = active, BUKAN scope currentlyActive.
     *
     * @throws ValidationException
     */
    private function guardAgainstOverlap(User $user, string $startDate, string $endDate): void
    {
        $overlaps = $user->memberships()
            ->where('status', 'active')
            ->where('end_date', '>=', $startDate)
            ->where('start_date', '<=', $endDate)
            ->exists();

        if ($overlaps) {
            throw ValidationException::withMessages([
                'start_date' => ['Periode membership baru bertabrakan dengan masa aktif yang sedang berjalan.'],
            ]);
        }
    }

    /**
     * B1: Tentukan record_type berdasarkan riwayat membership user.
     * registration: belum pernah ada membership active atau expired.
     * extension: sudah pernah ada (rejected tidak dihitung).
     */
    private function determineRecordType(User $user): string
    {
        $hadVerified = $user->memberships()
            ->whereIn('status', ['active', 'expired'])
            ->exists();

        return $hadVerified ? 'extension' : 'registration';
    }
}
