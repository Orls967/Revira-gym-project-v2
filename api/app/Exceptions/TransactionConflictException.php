<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Konflik bisnis pada verifikasi transaksi (transaksi sudah diproses, status membership tidak sesuai,
 * atau periode bertabrakan). Dibalas 409.
 * Kesalahan wajar dari sisi pengguna/aliran bisnis; tidak dicatat ke log (didaftarkan di dontReport).
 */
class TransactionConflictException extends RuntimeException
{
    /**
     * Pesan konflik untuk status verifikasi transaksi yang sudah bukan pending.
     */
    public static function forTransactionStatus(string $status): self
    {
        $message = match ($status) {
            'verified' => 'Transaksi ini sudah disetujui sebelumnya.',
            'rejected' => 'Transaksi ini sudah ditolak sebelumnya.',
            default => "Transaksi ini sudah diproses (status: {$status}).",
        };

        return new self($message);
    }

    /**
     * Pesan konflik untuk status membership yang tidak sesuai untuk diproses.
     */
    public static function forMembershipStatus(string $status): self
    {
        $message = match ($status) {
            'active' => 'Membership ini sudah aktif.',
            'rejected' => 'Membership ini sudah ditolak.',
            'expired' => 'Membership ini sudah kedaluwarsa.',
            default => "Status membership tidak sesuai untuk diproses (status: {$status}).",
        };

        return new self($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
