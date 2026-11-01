<?php

namespace App\Services\WhatsApp;

/**
 * Hasil WhatsAppSender::send(): berhasil atau gagal, beserta pesan error singkat bila gagal.
 *
 * Berhasil berarti pesan diterima gateway (masuk antrian), belum tentu sudah sampai ke penerima.
 */
final readonly class WhatsAppResult
{
    private function __construct(
        public bool $successful,
        public ?string $error = null,
    ) {}

    public static function success(): self
    {
        return new self(true);
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
