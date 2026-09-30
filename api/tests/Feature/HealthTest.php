<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    /**
     * Memastikan endpoint health check mengembalikan status HTTP 200 dan status 'ok'.
     */
    public function test_health_check_returns_ok_status(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'ok',
            ])
            ->assertJsonStructure([
                'status',
                'time',
            ]);
    }
}
