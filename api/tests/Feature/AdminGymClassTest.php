<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use Database\Seeders\ClassSeeder;
use Database\Seeders\InstructorSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

class AdminGymClassTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    private const URL = '/api/v1/admin/classes';

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Yoga Pagi',
            'description' => 'Yoga untuk pemula',
            'min_participants' => 3,
            'default_instructor_id' => null,
            'is_active' => true,
        ], $overrides);
    }

    /**
     * Tamu (tanpa token) ditolak 401 di semua endpoint.
     */
    public function test_guest_gets_401_on_all_endpoints(): void
    {
        $class = GymClass::factory()->create();

        $this->getJson(self::URL)->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        $this->postJson(self::URL, $this->validPayload())->assertUnauthorized();
        $this->getJson(self::URL."/{$class->id}")->assertUnauthorized();
        $this->putJson(self::URL."/{$class->id}", $this->validPayload())->assertUnauthorized();
        $this->deleteJson(self::URL."/{$class->id}")->assertUnauthorized();

        $this->assertDatabaseCount('classes', 1);
    }

    /**
     * Member ditolak 403 di semua endpoint dan data tidak berubah.
     */
    public function test_member_gets_403_on_all_endpoints(): void
    {
        $class = GymClass::factory()->create(['name' => 'Kelas Asli']);
        $this->actingAsMember();

        $forbidden = ['message' => 'Anda tidak memiliki akses ke sumber daya ini.'];

        $this->getJson(self::URL)->assertForbidden()->assertExactJson($forbidden);
        $this->postJson(self::URL, $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->getJson(self::URL."/{$class->id}")->assertForbidden()->assertExactJson($forbidden);
        $this->putJson(self::URL."/{$class->id}", $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->deleteJson(self::URL."/{$class->id}")->assertForbidden()->assertExactJson($forbidden);

        $this->assertDatabaseCount('classes', 1);
        $this->assertSame('Kelas Asli', $class->fresh()->name);
    }

    public function test_admin_lists_classes_with_pagination_format(): void
    {
        GymClass::factory()->count(3)->create();
        $this->actingAsAdmin();

        $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'description', 'min_participants', 'default_instructor_id', 'is_active', 'created_at', 'updated_at'],
                ],
                'links' => ['first', 'last', 'prev', 'next'],
                'meta' => ['current_page', 'from', 'last_page', 'links', 'path', 'per_page', 'to', 'total'],
            ])
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.per_page', 15);
    }

    public function test_admin_list_respects_per_page_and_page(): void
    {
        $classes = GymClass::factory()->count(5)->create();
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?per_page=2&page=3')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $classes->last()->id)
            ->assertJsonPath('meta.current_page', 3)
            ->assertJsonPath('meta.last_page', 3)
            ->assertJsonPath('meta.total', 5);
    }

    /**
     * Filter is_active menerima true/false maupun 1/0.
     */
    public function test_admin_can_filter_classes_by_is_active(): void
    {
        $active = GymClass::factory()->create(['is_active' => true]);
        $inactive = GymClass::factory()->create(['is_active' => false]);
        $this->actingAsAdmin();

        foreach (['true', '1'] as $value) {
            $this->getJson(self::URL."?is_active={$value}")
                ->assertOk()
                ->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.id', $active->id);
        }

        foreach (['false', '0'] as $value) {
            $this->getJson(self::URL."?is_active={$value}")
                ->assertOk()
                ->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.id', $inactive->id);
        }

        // Tanpa filter, kelas aktif dan nonaktif sama-sama tampil
        $this->getJson(self::URL)->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_admin_can_search_classes_by_name(): void
    {
        $yoga = GymClass::factory()->create(['name' => 'Yoga Morning Flow']);
        GymClass::factory()->create(['name' => 'Zumba Cardio Party']);
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?search=yoga')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $yoga->id);

        $this->getJson(self::URL.'?search=pilates')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function invalidQueryProvider(): array
    {
        return [
            'is_active bukan boolean' => ['is_active=mungkin', 'is_active'],
            'per_page 0' => ['per_page=0', 'per_page'],
            'per_page lebih dari 100' => ['per_page=101', 'per_page'],
            'page 0' => ['page=0', 'page'],
            'search lebih dari 100 karakter' => ['search='.str_repeat('a', 101), 'search'],
        ];
    }

    #[DataProvider('invalidQueryProvider')]
    public function test_invalid_list_query_is_rejected_with_422(string $query, string $field): void
    {
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?'.$query)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);
    }

    /**
     * Kelas dari seeder tampil dengan min_participants dan instruktur default yang benar.
     */
    public function test_seeded_classes_are_listed_correctly(): void
    {
        $this->seed([InstructorSeeder::class, ClassSeeder::class]);
        $this->actingAsAdmin();

        $response = $this->getJson(self::URL)->assertOk()->assertJsonCount(3, 'data');

        $yoga = collect($response->json('data'))->firstWhere('name', 'Yoga Morning Flow');
        $this->assertNotNull($yoga);
        $this->assertSame(3, $yoga['min_participants']);
        $this->assertTrue($yoga['is_active']);
        $this->assertSame(
            Instructor::where('name', 'Coach Agus Pratama')->value('id'),
            $yoga['default_instructor_id'],
        );
    }

    /**
     * Kelas dibuat dengan min_participants dan tanpa kapasitas maksimum (AC3 SCRUM-19).
     */
    public function test_admin_can_create_class(): void
    {
        $instructor = Instructor::factory()->create();
        $this->actingAsAdmin();

        $response = $this->postJson(self::URL, $this->validPayload([
            'default_instructor_id' => $instructor->id,
            // Field kapasitas maksimum tidak dikenal dan diabaikan
            'max_participants' => 20,
        ]))
            ->assertCreated()
            ->assertJson([
                'message' => 'Kelas berhasil dibuat.',
                'data' => [
                    'name' => 'Yoga Pagi',
                    'description' => 'Yoga untuk pemula',
                    'min_participants' => 3,
                    'default_instructor_id' => $instructor->id,
                    'is_active' => true,
                ],
            ]);

        $this->assertArrayNotHasKey('max_participants', $response->json('data'));
        $this->assertFalse(Schema::hasColumn('classes', 'max_participants'));
        $this->assertDatabaseHas('classes', ['name' => 'Yoga Pagi', 'min_participants' => 3]);
    }

    public function test_class_is_active_by_default_and_description_is_optional(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, ['name' => 'Kelas Minimal', 'min_participants' => 1])
            ->assertCreated()
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.description', null)
            ->assertJsonPath('data.default_instructor_id', null);
    }

    public function test_admin_can_show_class(): void
    {
        $class = GymClass::factory()->create(['min_participants' => 4]);
        $this->actingAsAdmin();

        $this->getJson(self::URL."/{$class->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $class->id)
            ->assertJsonPath('data.name', $class->name)
            ->assertJsonPath('data.min_participants', 4);
    }

    public function test_admin_can_update_class_and_deactivate_it(): void
    {
        $class = GymClass::factory()->create(['is_active' => true]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$class->id}", $this->validPayload([
            'name' => 'Yoga Sore',
            'min_participants' => 5,
            'is_active' => false,
        ]))
            ->assertOk()
            ->assertJson([
                'message' => 'Kelas berhasil diperbarui.',
                'data' => ['id' => $class->id, 'name' => 'Yoga Sore', 'min_participants' => 5, 'is_active' => false],
            ]);

        $this->assertFalse($class->fresh()->is_active);
    }

    public function test_admin_can_delete_class_without_schedule(): void
    {
        $class = GymClass::factory()->create();
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$class->id}")
            ->assertOk()
            ->assertExactJson(['message' => 'Kelas berhasil dihapus.']);

        $this->assertDatabaseMissing('classes', ['id' => $class->id]);
    }

    /**
     * Kelas yang sudah punya jadwal tidak dihapus; pesan menyarankan menonaktifkan kelas.
     */
    public function test_deleting_class_with_schedule_returns_409(): void
    {
        $schedule = ClassSchedule::factory()->create();
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$schedule->class_id}")
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Kelas tidak dapat dihapus karena sudah memiliki jadwal. Silakan nonaktifkan kelas (is_active = false) sebagai alternatif.',
            ]);

        $this->assertDatabaseHas('classes', ['id' => $schedule->class_id]);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidPayloadProvider(): array
    {
        return [
            'name kosong' => [['name' => ''], 'name'],
            'name lebih dari 100 karakter' => [['name' => str_repeat('a', 101)], 'name'],
            'description bukan teks' => [['description' => ['a']], 'description'],
            'description lebih dari 1000 karakter' => [['description' => str_repeat('a', 1001)], 'description'],
            'min_participants kosong' => [['min_participants' => null], 'min_participants'],
            'min_participants 0' => [['min_participants' => 0], 'min_participants'],
            'min_participants negatif' => [['min_participants' => -1], 'min_participants'],
            'min_participants pecahan' => [['min_participants' => 2.5], 'min_participants'],
            'min_participants bukan angka' => [['min_participants' => 'tiga'], 'min_participants'],
            'default_instructor_id tidak ada' => [['default_instructor_id' => 999], 'default_instructor_id'],
            'default_instructor_id bukan angka' => [['default_instructor_id' => 'abc'], 'default_instructor_id'],
            'is_active bukan boolean' => [['is_active' => 'mungkin'], 'is_active'],
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
        $class = GymClass::factory()->create(['name' => 'Kelas Asli', 'min_participants' => 2]);
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->putJson(self::URL."/{$class->id}", $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->assertDatabaseCount('classes', 1);
        $this->assertSame(2, $class->fresh()->min_participants);
    }

    public function test_missing_class_returns_404(): void
    {
        $this->actingAsAdmin();

        $notFound = ['message' => 'Data tidak ditemukan.'];

        $this->getJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
        $this->putJson(self::URL.'/999', $this->validPayload())->assertNotFound()->assertExactJson($notFound);
        $this->deleteJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
    }

    /**
     * Scope active() dipakai SCRUM-55 agar kelas nonaktif tidak bisa dipilih untuk jadwal baru.
     */
    public function test_active_scope_excludes_inactive_classes(): void
    {
        $active = GymClass::factory()->create(['is_active' => true]);
        GymClass::factory()->create(['is_active' => false]);

        $this->assertSame([$active->id], GymClass::active()->pluck('id')->all());
    }
}
