<?php

namespace App\Services\WhatsApp;

/**
 * Hasil WhatsAppSender::send(): berhasil atau gagal, beserta pesan error singkat bila gagal.
 *
 * Berhasil berarti pesan diterima gateway (masuk antrian), belum tentu sudah sampai ke penerima.
 * messageId adalah ID pesan dari gateway (null untuk driver log) untuk dicatat di notification_logs (SCRUM-30).
 */
final readonly class WhatsAppResult
{
    private function __construct(
        public bool $successful,
        public ?string $error = null,
        public ?string $messageId = null,
    ) {}

    public static function success(?string $messageId = null): self
    {
        return new self(true, messageId: $messageId);
    }

    public static function failure(string $error): self
    {
        return new self(false, $error);
    }

    public function failed(): bool
    {
        return ! $this->successful;
    }
}
