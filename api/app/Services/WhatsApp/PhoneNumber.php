<?php

namespace App\Services\WhatsApp;

/**
 * Normalisasi nomor WhatsApp Indonesia ke format internasional tanpa "+" (62xx).
 */
final class PhoneNumber
{
    /**
     * Nomor seluler Indonesia: 62 8 lalu 7 sampai 11 digit (total 10 sampai 14 digit).
     */
    private const VALID_PATTERN = '/^628\d{7,11}$/';

    /**
     * Ubah 08xx / +62xx / 62xx menjadi 62xx. Spasi, tanda hubung, titik, dan kurung diabaikan.
     * Mengembalikan null bila nomor kosong atau tidak valid.
     */
    public static function normalize(?string $phone): ?string
    {
        $digits = preg_replace('/[\s\-.()]/', '', (string) $phone);

        if (str_starts_with($digits, '+')) {
            $digits = substr($digits, 1);
        } elseif (str_starts_with($digits, '0')) {
            $digits = '62'.substr($digits, 1);
        }

        return preg_match(self::VALID_PATTERN, $digits) ? $digits : null;
    }
}
