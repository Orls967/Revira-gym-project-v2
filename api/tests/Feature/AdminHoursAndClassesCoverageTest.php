<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\OperationalHour;
use App\Services\Auth\ApiTokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

/**
 * Tes penutup celah matriks SCRUM-53 untuk endpoint jam operasional (SCRUM-51) dan kelas (SCRUM-52).
 *
 * Kasus dasar per endpoint (tamu 401, member 403, admin berhasil, 404, validasi 422) ada di
 * AdminOperationalHourTest dan AdminGymClassTest; file ini menambah kasus yang belum tercakup.
 */
class AdminHoursAndClassesCoverageTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    /**
     * Semua endpoint admin jam dan kelas; {id} diganti ID data yang ada.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function endpointProvider(): array
    {
        return [
            'list jam' => ['GET', '/api/v1/admin/operational-hours'],
            'tambah jam' => ['POST', '/api/v1/admin/operational-hours'],
            'detail jam' => ['GET', '/api/v1/admin/operational-hours/{id}'],
            'ubah jam' => ['PUT', '/api/v1/admin/operational-hours/{id}'],
            'hapus jam' => ['DELETE', '/api/v1/admin/operational-hours/{id}'],
            'list kelas' => ['GET', '/api/v1/admin/classes'],
            'tambah kelas' => ['POST', '/api/v1/admin/classes'],
            'detail kelas' => ['GET', '/api/v1/admin/classes/{id}'],
            'ubah kelas' => ['PUT', '/api/v1/admin/classes/{id}'],
            'hapus kelas' => ['DELETE', '/api/v1/admin/classes/{id}'],
        ];
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function endpointWithIdProvider(): array
    {
        return array_filter(self::endpointProvider(), fn (array $case) => str_contains($case[1], '{id}'));
    }

    private function resolveUri(string $uri): string
    {
        $id = str_contains($uri, 'operational-hours')
            ? OperationalHour::factory()->create()->id
            : GymClass::factory()->create()->id;

        return str_replace('{id}', (string) $id, $uri);
    }

    /**
     * Token yang salah ditolak 401 (klien harus menghapus token), bukan 403.
     */
    #[DataProvider('endpointProvider')]
    public function test_invalid_token_gets_401(string $method, string $uri): void
    {
        $this->withToken('1|token-yang-tidak-pernah-dibuat')
            ->json($method, $this->resolveUri($uri))
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * Token admin yang sudah dicabut (logout) ditolak 401.
     */
    #[DataProvider('endpointProvider')]
    public function test_revoked_admin_token_gets_401(string $method, string $uri): void
    {
        $admin = $this->createAdmin();
        $headers = $this->bearerHeaders($admin);
        app(ApiTokenService::class)->revokeAllTokens($admin);

        $this->withHeaders($headers)
            ->json($method, $this->resolveUri($uri))
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }

    /**
     * ID yang bukan angka tidak cocok dengan route dan mendapat 404 seragam.
     */
    #[DataProvider('endpointWithIdProvider')]
    public function test_non_numeric_id_returns_404(string $method, string $uri): void
    {
        $this->actingAsAdmin();

        $this->json($method, str_replace('{id}', 'abc', $uri))
            ->assertNotFound()
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    public function test_hours_list_is_empty_array_when_no_data(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/v1/admin/operational-hours')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    /**
     * Mengubah hari libur menjadi buka wajib menyertakan jam.
     */
    public function test_reopening_closed_day_without_hours_returns_422(): void
    {
        $hour = OperationalHour::factory()->create([
            'day_of_week' => 'Minggu', 'open_time' => null, 'close_time' => null, 'is_closed' => true,
        ]);
        $this->actingAsAdmin();

        $this->putJson("/api/v1/admin/operational-hours/{$hour->id}", ['day_of_week' => 'Minggu', 'is_closed' => false])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['open_time', 'close_time']);

        $this->assertTrue($hour->fresh()->is_closed);
    }

    /**
     * Nilai day_of_week harus persis seperti enum migration (huruf kapital di awal).
     */
    public function test_lowercase_day_of_week_returns_422(): void
    {
        $this->actingAsAdmin();

        $this->postJson('/api/v1/admin/operational-hours', [
            'day_of_week' => 'senin', 'open_time' => '06:00', 'close_time' => '21:00', 'is_closed' => false,
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['day_of_week']);
    }

    /**
     * PUT tanpa is_active tidak mengubah status aktif kelas.
     */
    public function test_class_update_without_is_active_keeps_current_status(): void
    {
        $class = GymClass::factory()->create(['is_active' => false]);
        $this->actingAsAdmin();

        $this->putJson("/api/v1/admin/classes/{$class->id}", ['name' => 'Nama Baru', 'min_participants' => 2])
            ->assertOk()
            ->assertJsonPath('data.name', 'Nama Baru')
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('classes', ['id' => $class->id, 'name' => 'Nama Baru', 'is_active' => false]);
    }

    /**
     * Filter is_active dan pencarian nama bisa dipakai bersamaan.
     */
    public function test_class_filter_and_search_combine(): void
    {
        $target = GymClass::factory()->create(['name' => 'Yoga Pagi', 'is_active' => true]);
        GymClass::factory()->create(['name' => 'Yoga Sore', 'is_active' => false]);
        GymClass::factory()->create(['name' => 'Zumba', 'is_active' => true]);
        $this->actingAsAdmin();

        $this->getJson('/api/v1/admin/classes?is_active=true&search=yoga')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $target->id);
    }

    /**
     * Link paginasi membawa query filter agar halaman berikutnya tetap terfilter.
     */
    public function test_class_pagination_links_keep_query_string(): void
    {
        GymClass::factory()->count(3)->create(['is_active' => true]);
        $this->actingAsAdmin();

        $next = $this->getJson('/api/v1/admin/classes?is_active=true&per_page=2')
            ->assertOk()
            ->json('links.next');

        $this->assertNotNull($next);
        $this->assertStringContainsString('is_active=true', $next);
        $this->assertStringContainsString('per_page=2', $next);
        $this->assertStringContainsString('page=2', $next);
    }

    /**
     * Item daftar kelas tidak memuat field kapasitas maksimum (AC3 SCRUM-19).
     */
    public function test_class_list_items_have_no_max_capacity_field(): void
    {
        GymClass::factory()->create();
        $this->actingAsAdmin();

        $item = $this->getJson('/api/v1/admin/classes')->assertOk()->json('data.0');

        $this->assertSame(
            ['id', 'name', 'description', 'min_participants', 'default_instructor_id', 'is_active', 'created_at', 'updated_at'],
            array_keys($item),
        );
    }

    /**
     * Jadwal yang dibatalkan tetap merujuk kelas (FK restrict), jadi kelas tetap tidak bisa dihapus.
     */
    public function test_class_with_only_cancelled_schedule_still_returns_409(): void
    {
        $schedule = ClassSchedule::factory()->create(['status' => 'cancelled', 'cancel_reason' => 'Instruktur sakit']);
        $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/classes/{$schedule->class_id}")
            ->assertStatus(409);

        $this->assertDatabaseHas('classes', ['id' => $schedule->class_id]);
    }

    public function test_inactive_class_without_schedule_can_be_deleted(): void
    {
        $class = GymClass::factory()->create(['is_active' => false]);
        $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/classes/{$class->id}")->assertOk();

        $this->assertDatabaseMissing('classes', ['id' => $class->id]);
    }

    /**
     * Pesan validasi khusus yang dilihat admin, satu kasus per pesan yang belum diuji teksnya.
     *
     * @return array<string, array{0: string, 1: array<string, mixed>, 2: string, 3: string}>
     */
    public static function validationMessageProvider(): array
    {
        $hour = ['day_of_week' => 'Senin', 'open_time' => '06:00', 'close_time' => '21:00', 'is_closed' => false];
        $class = ['name' => 'Yoga Pagi', 'min_participants' => 3];

        return [
            'jam: hari tidak dikenal' => [
                '/api/v1/admin/operational-hours', [...$hour, 'day_of_week' => 'Monday'], 'day_of_week',
                'Hari harus salah satu dari: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu.',
            ],
            'jam: jam buka kosong' => [
                '/api/v1/admin/operational-hours', [...$hour, 'open_time' => null], 'open_time',
                'Jam buka wajib diisi bila hari tidak libur.',
            ],
            'jam: jam tutup kosong' => [
                '/api/v1/admin/operational-hours', [...$hour, 'close_time' => null], 'close_time',
                'Jam tutup wajib diisi bila hari tidak libur.',
            ],
            'jam: format jam buka' => [
                '/api/v1/admin/operational-hours', [...$hour, 'open_time' => '6 pagi'], 'open_time',
                'Jam buka harus berformat HH:MM.',
            ],
            'jam: format jam tutup' => [
                '/api/v1/admin/operational-hours', [...$hour, 'close_time' => '21.00'], 'close_time',
                'Jam tutup harus berformat HH:MM.',
            ],
            'kelas: min_participants 0' => [
                '/api/v1/admin/classes', [...$class, 'min_participants' => 0], 'min_participants',
                'Jumlah peserta minimum harus minimal 1.',
            ],
            'kelas: instruktur tidak ada' => [
                '/api/v1/admin/classes', [...$class, 'default_instructor_id' => 999], 'default_instructor_id',
                'Instruktur tidak ditemukan atau tidak aktif.',
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('validationMessageProvider')]
    public function test_validation_failure_returns_422_with_indonesian_message(string $uri, array $payload, string $field, string $message): void
    {
        $this->actingAsAdmin();

        $this->postJson($uri, $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field => $message]);

        $this->assertDatabaseCount(str_contains($uri, 'classes') ? 'classes' : 'operational_hours', 0);
    }

    public function test_invalid_is_active_filter_returns_422_with_indonesian_message(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/v1/admin/classes?is_active=mungkin')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['is_active' => 'Filter is_active harus bernilai true, false, 1, atau 0.']);
    }
}
