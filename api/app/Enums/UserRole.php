<?php

namespace App\Enums;

/**
 * Peran user. Satu tabel users dipakai admin dan member (lihat docs/erd.md).
 */
enum UserRole: string
{
    case Admin = 'admin';
    case Member = 'member';
}
