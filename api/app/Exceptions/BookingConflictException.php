<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Booking ganda: member sudah punya booking aktif (booked/attended) di sesi yang sama. Dibalas 409.
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
