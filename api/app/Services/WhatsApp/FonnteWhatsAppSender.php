<?php

namespace App\Services\WhatsApp;

use App\Contracts\WhatsAppSender;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Driver gateway Fonnte (https://docs.fonnte.com/api-send-message/).
 *
 * Fonnte membalas kegagalan dengan "status": false di body (kadang tetap HTTP 200),
 * jadi hasil dianggap berhasil hanya bila HTTP sukses dan status bernilai true.
 */
class FonnteWhatsAppSender implements WhatsAppSender
{
    public const ENDPOINT = 'https://api.fonnte.com/send';

    public function __construct(
        private readonly ?string $token,
        private readonly int $timeoutSeconds = 10,
    ) {}

    public function send(string $phone, string $message): WhatsAppResult
    {
        $normalized = PhoneNumber::normalize($phone);

        if ($normalized === null) {
            return WhatsAppResult::failure('Nomor WhatsApp kosong atau tidak valid.');
        }

        if (blank($this->token)) {
            return WhatsAppResult::failure('Token gateway WhatsApp belum dikonfigurasi.');
        }

        try {
            // Token dikirim langsung tanpa awalan "Bearer" sesuai dokumentasi Fonnte
            $response = Http::withHeaders(['Authorization' => $this->token])
                ->timeout($this->timeoutSeconds)
                ->asForm()
                ->post(self::ENDPOINT, [
                    'target' => $normalized,
                    'message' => $message,
                    'countryCode' => '62',
                ]);
        } catch (ConnectionException $e) {
            return WhatsAppResult::failure('Gagal terhubung ke gateway WhatsApp: '.Str::limit($e->getMessage(), 150));
        }

        if ($response->successful() && $response->json('status') === true) {
            // Fonnte mengembalikan id sebagai array (satu id per target)
            $messageId = $response->json('id.0');

            return WhatsAppResult::success(is_scalar($messageId) ? (string) $messageId : null);
        }

        $reason = $response->json('reason') ?? $response->json('detail');

        if (! is_string($reason) || $reason === '') {
            $reason = 'HTTP '.$response->status();
        }

        return WhatsAppResult::failure('Gateway WhatsApp menolak: '.Str::limit($reason, 150));
    }
}
