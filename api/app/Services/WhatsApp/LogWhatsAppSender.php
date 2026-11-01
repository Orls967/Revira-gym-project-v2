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

        Log::info('WhatsApp (driver log, tidak dikirim)', [
            'phone' => $normalized,
            'message' => $message,
        ]);

        return WhatsAppResult::success();
    }
}
