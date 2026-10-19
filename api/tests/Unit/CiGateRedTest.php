<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class CiGateRedTest extends TestCase
{
    /**
     * Tes ini sengaja dibuat GAGAL untuk memverifikasi bahwa job ci-gate
     * pada GitHub Actions benar-benar mendeteksi kegagalan dan memblokir
     * PR yang tidak lulus pemeriksaan otomatis (SCRUM-106).
     *
     * File ini TIDAK dimaksudkan untuk di-merge ke dev.
     */
    public function test_sengaja_gagal_untuk_uji_ci_gate(): void
    {
        $this->assertTrue(false);
    }
}
