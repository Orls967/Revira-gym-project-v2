<?php

namespace App\Contracts;

use App\Services\WhatsApp\WhatsAppResult;

/**
 * Klien pengirim pesan WhatsApp yang dipakai semua notifikasi (SCRUM-83).
 *
 * Driver dipilih lewat config services.whatsapp.driver (env WHATSAPP_DRIVER).
 * Implementasi tidak boleh melempar exception ke pemanggil: nomor tidak valid,
 * error jaringan, dan penolakan gateway dikembalikan sebagai hasil gagal.
 */
interface WhatsAppSender
{
    /**
     * Kirim pesan teks ke satu nomor. Nomor 08xx / +62xx dinormalisasi menjadi 62xx.
     */
    public function send(string $phone, string $message): WhatsAppResult;
}
