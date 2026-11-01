<?php

namespace App\Services\WhatsApp;

use App\Contracts\WhatsAppSender;
use Illuminate\Support\Facades\Log;

/**
 * Driver "log" untuk lokal, CI, dan staging sebelum gateway siap: pesan ditulis ke log, tidak dikirim.
 *
 * Validasi nomor tetap dijalankan agar perilakunya sama dengan driver gateway.
 */
class LogWhatsAppSender implements WhatsAppSender
{
    public function send(string $phone, string $message): WhatsAppResult
    {
        $normalized = PhoneNumber::normalize($phone);

        if ($normalized === null) {
            return WhatsAppResult::failure('Nomor WhatsApp kosong atau tidak valid.');
        }

        // Log staging bisa dibaca seluruh tim, jadi nomor member disamarkan di luar lokal
        Log::info('WhatsApp (driver log, tidak dikirim)', [
            'phone' => app()->environment('local') ? $normalized : self::mask($normalized),
            'message' => $message,
        ]);

        return WhatsAppResult::success();
    }

    /**
     * Samarkan digit tengah nomor: 6281234567890 menjadi 62812*****890.
     */
    public static function mask(string $phone): string
    {
        return substr($phone, 0, 5).str_repeat('*', strlen($phone) - 8).substr($phone, -3);
    }
}
