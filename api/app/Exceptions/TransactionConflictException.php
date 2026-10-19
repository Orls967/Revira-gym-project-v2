<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Konflik bisnis pada verifikasi transaksi (transaksi sudah diproses atau periode bertabrakan). Dibalas 409.
 * Kesalahan wajar dari sisi pengguna/aliran bisnis; tidak dicatat ke log (didaftarkan di dontReport).
 */
class TransactionConflictException extends RuntimeException
{
    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
