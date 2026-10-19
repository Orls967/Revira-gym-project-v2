<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Booking ganda: member sudah punya booking aktif (booked/attended) di sesi yang sama. Dibalas 409.
 * Ini kesalahan wajar dari sisi user, bukan error server, jadi tidak dicatat ke log: didaftarkan di dontReport
 * (bootstrap/app.php). Jangan menambah method report() yang mengembalikan false, karena bagi handler Laravel
 * nilai false berarti "lanjutkan pencatatan default" sehingga exception tetap masuk laravel.log.
 */
class BookingConflictException extends RuntimeException
{
    public function __construct(string $message = 'Anda sudah booking sesi kelas ini.')
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage()], 409);
    }
}
