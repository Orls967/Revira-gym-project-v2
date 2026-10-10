<?php

namespace Tests\Feature;

use App\Models\GymClass;
use App\Models\MembershipPlan;
use App\Models\OperationalHour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class PublicEndpointsTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_can_get_only_active_membership_plans(): void
    {
        MembershipPlan::factory()->create([
            'name' => 'Paket Aktif 1',
            'price' => 200000,
            'is_active' => true,
        ]);
        MembershipPlan::factory()->create([
            'name' => 'Paket Aktif 2',
            'price' => 100000,
            'is_active' => true,
        ]);
        MembershipPlan::factory()->create([
            'name' => 'Paket Nonaktif',
            'price' => 50000,
            'is_active' => false,
        ]);

        $response = $this->getJson('/api/v1/membership-plans');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'name',
                        'duration_days',
                        'price',
                        'description',
                    ],
                ],
            ]);

        // Pastikan tidak ada is_active, created_at, updated_at
        $data = $response->json('data');
        foreach ($data as $item) {
            $this->assertArrayNotHasKey('is_active', $item);
            $this->assertArrayNotHasKey('created_at', $item);
            $this->assertArrayNotHasKey('updated_at', $item);
        }

        // Terurut berdasarkan price (100000 dulu baru 200000)
        $this->assertSame(100000, $data[0]['price']);
        $this->assertSame(200000, $data[1]['price']);
        $this->assertIsInt($data[0]['price']);
        $this->assertIsInt($data[1]['price']);
    }

    public function test_public_can_get_operational_hours_ordered_senin_to_minggu(): void
    {
        OperationalHour::factory()->create([
            'day_of_week' => 'Rabu',
            'open_time' => '07:00:00',
            'close_time' => '21:00:00',
            'is_closed' => false,
        ]);
        OperationalHour::factory()->create([
            'day_of_week' => 'Senin',
            'open_time' => '06:00:00',
            'close_time' => '21:00:00',
            'is_closed' => false,
        ]);
        OperationalHour::factory()->create([
            'day_of_week' => 'Minggu',
            'open_time' => null,
            'close_time' => null,
            'is_closed' => true,
        ]);
        OperationalHour::factory()->create([
            'day_of_week' => 'Jumat',
            'open_time' => '08:00:00',
            'close_time' => '20:00:00',
            'is_closed' => false,
        ]);

        $response = $this->getJson('/api/v1/operational-hours');

        $response->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'day_of_week',
                        'open_time',
                        'close_time',
                        'is_closed',
                    ],
                ],
            ]);

        $days = collect($response->json('data'))->pluck('day_of_week')->all();
        $this->assertSame(['Senin', 'Rabu', 'Jumat', 'Minggu'], $days);

        $firstItem = $response->json('data.0');
        $this->assertSame('06:00', $firstItem['open_time']);
        $this->assertSame('21:00', $firstItem['close_time']);
        $this->assertFalse($firstItem['is_closed']);

        $lastItem = $response->json('data.3');
        $this->assertNull($lastItem['open_time']);
        $this->assertNull($lastItem['close_time']);
        $this->assertTrue($lastItem['is_closed']);

        // Pastikan tidak ada id, created_at, updated_at
        foreach ($response->json('data') as $item) {
            $this->assertArrayNotHasKey('id', $item);
            $this->assertArrayNotHasKey('created_at', $item);
            $this->assertArrayNotHasKey('updated_at', $item);
        }
    }

    public function test_public_can_get_only_active_classes(): void
    {
        GymClass::factory()->create([
            'name' => 'Yoga Pagi',
            'is_active' => true,
        ]);
        GymClass::factory()->create([
            'name' => 'Zumba Sore',
            'is_active' => true,
        ]);
        GymClass::factory()->create([
            'name' => 'Boxing Malam (Tutup)',
            'is_active' => false,
        ]);

        $response = $this->getJson('/api/v1/classes');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id',
                        'name',
                        'description',
                    ],
                ],
            ]);

        // Tidak ada min_participants, default_instructor_id, is_active, created_at
        foreach ($response->json('data') as $item) {
            $this->assertArrayNotHasKey('min_participants', $item);
            $this->assertArrayNotHasKey('default_instructor_id', $item);
            $this->assertArrayNotHasKey('is_active', $item);
            $this->assertArrayNotHasKey('created_at', $item);
            $this->assertArrayNotHasKey('updated_at', $item);
        }
    }

    public function test_public_rate_limiter_throttles_after_limit_exceeded(): void
    {
        RateLimiter::clear('public-api:127.0.0.1');

        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/v1/membership-plans')->assertOk();
        }

        $this->getJson('/api/v1/membership-plans')
            ->assertTooManyRequests();
    }

    public function test_public_rate_limiter_respects_x_forwarded_for_and_isolates_ip_quotas(): void
    {
        RateLimiter::clear('public-api:10.0.0.1');
        RateLimiter::clear('public-api:10.0.0.2');

        for ($i = 0; $i < 120; $i++) {
            $this->getJson('/api/v1/membership-plans', [
                'X-Forwarded-For' => '10.0.0.1',
            ])->assertOk();
        }

        $this->getJson('/api/v1/membership-plans', [
            'X-Forwarded-For' => '10.0.0.1',
        ])->assertTooManyRequests();

        $this->getJson('/api/v1/membership-plans', [
            'X-Forwarded-For' => '10.0.0.2',
        ])->assertOk();
    }
}
