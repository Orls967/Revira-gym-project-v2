<?php

namespace Tests\Feature;

use App\Models\OperationalHour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

class AdminOperationalHourTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    private const URL = '/api/v1/admin/operational-hours';

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'day_of_week' => 'Senin',
            'open_time' => '06:00',
            'close_time' => '21:00',
            'is_closed' => false,
        ], $overrides);
    }

    /**
     * Tamu (tanpa token) ditolak 401 di semua endpoint.
     */
    public function test_guest_gets_401_on_all_endpoints(): void
    {
        $hour = OperationalHour::factory()->create();

        $this->getJson(self::URL)->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        $this->postJson(self::URL, $this->validPayload())->assertUnauthorized();
        $this->getJson(self::URL."/{$hour->id}")->assertUnauthorized();
        $this->putJson(self::URL."/{$hour->id}", $this->validPayload())->assertUnauthorized();
        $this->deleteJson(self::URL."/{$hour->id}")->assertUnauthorized();

        $this->assertDatabaseCount('operational_hours', 1);
    }

    /**
     * Member ditolak 403 di semua endpoint dan data tidak berubah.
     */
    public function test_member_gets_403_on_all_endpoints(): void
    {
        $hour = OperationalHour::factory()->create(['day_of_week' => 'Selasa']);
        $this->actingAsMember();

        $forbidden = ['message' => 'Anda tidak memiliki akses ke sumber daya ini.'];

        $this->getJson(self::URL)->assertForbidden()->assertExactJson($forbidden);
        $this->postJson(self::URL, $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->getJson(self::URL."/{$hour->id}")->assertForbidden()->assertExactJson($forbidden);
        $this->putJson(self::URL."/{$hour->id}", $this->validPayload(['day_of_week' => 'Selasa']))
            ->assertForbidden()->assertExactJson($forbidden);
        $this->deleteJson(self::URL."/{$hour->id}")->assertForbidden()->assertExactJson($forbidden);

        $this->assertDatabaseCount('operational_hours', 1);
        $this->assertDatabaseMissing('operational_hours', ['day_of_week' => 'Senin']);
    }

    /**
     * Daftar jam terurut Senin sampai Minggu walau dibuat acak, dengan jam format HH:MM.
     */
    public function test_admin_lists_hours_ordered_monday_to_sunday(): void
    {
        foreach (['Minggu', 'Rabu', 'Senin', 'Sabtu', 'Jumat', 'Selasa', 'Kamis'] as $day) {
            OperationalHour::factory()->create(['day_of_week' => $day]);
        }
        $this->actingAsAdmin();

        $response = $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonCount(7, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'day_of_week', 'open_time', 'close_time', 'is_closed', 'created_at', 'updated_at'],
                ],
            ]);

        $this->assertSame(OperationalHour::DAYS, array_column($response->json('data'), 'day_of_week'));
        $this->assertSame('07:00', $response->json('data.0.open_time'));
        $this->assertSame('21:00', $response->json('data.0.close_time'));
    }

    public function test_admin_can_create_operational_hour(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload())
            ->assertCreated()
            ->assertJson([
                'message' => 'Jam operasional berhasil dibuat.',
                'data' => [
                    'day_of_week' => 'Senin',
                    'open_time' => '06:00',
                    'close_time' => '21:00',
                    'is_closed' => false,
                ],
            ]);

        $this->assertDatabaseHas('operational_hours', ['day_of_week' => 'Senin', 'is_closed' => false]);
    }

    public function test_admin_can_show_operational_hour(): void
    {
        $hour = OperationalHour::factory()->create(['day_of_week' => 'Kamis']);
        $this->actingAsAdmin();

        $this->getJson(self::URL."/{$hour->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $hour->id)
            ->assertJsonPath('data.day_of_week', 'Kamis')
            ->assertJsonPath('data.open_time', '07:00');
    }

    public function test_admin_can_update_operational_hour(): void
    {
        $hour = OperationalHour::factory()->create(['day_of_week' => 'Senin']);
        $this->actingAsAdmin();

        // Hari yang sama milik baris itu sendiri bukan duplikat
        $this->putJson(self::URL."/{$hour->id}", $this->validPayload(['open_time' => '08:00', 'close_time' => '20:30']))
            ->assertOk()
            ->assertJson([
                'message' => 'Jam operasional berhasil diperbarui.',
                'data' => ['id' => $hour->id, 'open_time' => '08:00', 'close_time' => '20:30'],
            ]);
    }

    public function test_admin_can_delete_operational_hour(): void
    {
        $hour = OperationalHour::factory()->create();
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$hour->id}")
            ->assertOk()
            ->assertExactJson(['message' => 'Jam operasional berhasil dihapus.']);

        $this->assertDatabaseMissing('operational_hours', ['id' => $hour->id]);
    }

    /**
     * Admin dapat menandai hari sebagai libur tanpa mengisi jam (AC2 SCRUM-19).
     */
    public function test_closed_day_without_hours_is_accepted(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, ['day_of_week' => 'Minggu', 'is_closed' => true])
            ->assertCreated()
            ->assertJsonPath('data.is_closed', true)
            ->assertJsonPath('data.open_time', null)
            ->assertJsonPath('data.close_time', null);
    }

    /**
     * Jam yang dikirim untuk hari libur diabaikan dan disimpan kosong, termasuk format yang salah.
     */
    public function test_hours_are_ignored_when_day_is_closed(): void
    {
        $hour = OperationalHour::factory()->create(['day_of_week' => 'Sabtu']);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$hour->id}", [
            'day_of_week' => 'Sabtu',
            'is_closed' => true,
            'open_time' => 'bukan-jam',
            'close_time' => '05:00',
        ])
            ->assertOk()
            ->assertJsonPath('data.is_closed', true)
            ->assertJsonPath('data.open_time', null)
            ->assertJsonPath('data.close_time', null);

        $hour->refresh();
        $this->assertNull($hour->open_time);
        $this->assertNull($hour->close_time);
    }

    public function test_open_day_requires_hours(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, ['day_of_week' => 'Senin', 'is_closed' => false])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['open_time', 'close_time']);
    }

    public function test_duplicate_day_is_rejected_on_create(): void
    {
        OperationalHour::factory()->create(['day_of_week' => 'Senin']);
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['day_of_week' => 'Jam operasional untuk hari ini sudah ada.']);

        $this->assertDatabaseCount('operational_hours', 1);
    }

    public function test_duplicate_day_is_rejected_on_update(): void
    {
        OperationalHour::factory()->create(['day_of_week' => 'Senin']);
        $selasa = OperationalHour::factory()->create(['day_of_week' => 'Selasa']);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$selasa->id}", $this->validPayload(['day_of_week' => 'Senin']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['day_of_week']);

        $this->assertSame('Selasa', $selasa->fresh()->day_of_week);
    }

    public function test_close_time_before_open_time_is_rejected(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['open_time' => '21:00', 'close_time' => '06:00']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['close_time' => 'Jam tutup harus setelah jam buka.']);
    }

    public function test_close_time_equal_to_open_time_is_rejected(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['open_time' => '08:00', 'close_time' => '08:00']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['close_time']);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidPayloadProvider(): array
    {
        return [
            'day_of_week kosong' => [['day_of_week' => null], 'day_of_week'],
            'day_of_week bukan nama hari' => [['day_of_week' => 'Monday'], 'day_of_week'],
            'is_closed kosong' => [['is_closed' => null], 'is_closed'],
            'is_closed bukan boolean' => [['is_closed' => 'mungkin'], 'is_closed'],
            'open_time format salah' => [['open_time' => '6 pagi'], 'open_time'],
            'open_time dengan detik' => [['open_time' => '06:00:00'], 'open_time'],
            'open_time jam 24' => [['open_time' => '24:00'], 'open_time'],
            'close_time format salah' => [['close_time' => '21.00'], 'close_time'],
        ];
    }

    /**
     * Setiap aturan validasi ditolak 422, baik saat tambah maupun ubah.
     *
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('invalidPayloadProvider')]
    public function test_invalid_payload_is_rejected_with_422(array $overrides, string $field): void
    {
        $hour = OperationalHour::factory()->create(['day_of_week' => 'Rabu']);
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->putJson(self::URL."/{$hour->id}", $this->validPayload(['day_of_week' => 'Rabu', ...$overrides]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->assertDatabaseCount('operational_hours', 1);
    }

    public function test_missing_operational_hour_returns_404(): void
    {
        $this->actingAsAdmin();

        $notFound = ['message' => 'Data tidak ditemukan.'];

        $this->getJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
        $this->putJson(self::URL.'/999', $this->validPayload())->assertNotFound()->assertExactJson($notFound);
        $this->deleteJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
    }
}
