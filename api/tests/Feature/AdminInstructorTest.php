<?php

namespace Tests\Feature;

use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

class AdminInstructorTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    private const URL = '/api/v1/admin/instructors';

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Budi Santoso',
            'specialization' => 'Yoga',
            'phone_number' => '081234567890',
            'is_active' => true,
        ], $overrides);
    }

    /**
     * Tamu (tanpa token) ditolak 401 di semua endpoint.
     */
    public function test_guest_gets_401_on_all_endpoints(): void
    {
        $instructor = Instructor::factory()->create();

        $this->getJson(self::URL)->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        $this->postJson(self::URL, $this->validPayload())->assertUnauthorized();
        $this->getJson(self::URL."/{$instructor->id}")->assertUnauthorized();
        $this->putJson(self::URL."/{$instructor->id}", $this->validPayload())->assertUnauthorized();
        $this->deleteJson(self::URL."/{$instructor->id}")->assertUnauthorized();

        $this->assertDatabaseCount('instructors', 1);
    }

    /**
     * Member ditolak 403 di semua endpoint dan data tidak berubah.
     */
    public function test_member_gets_403_on_all_endpoints(): void
    {
        $instructor = Instructor::factory()->create(['name' => 'Instruktur Asli']);
        $this->actingAsMember();

        $forbidden = ['message' => 'Anda tidak memiliki akses ke sumber daya ini.'];

        $this->getJson(self::URL)->assertForbidden()->assertExactJson($forbidden);
        $this->postJson(self::URL, $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->getJson(self::URL."/{$instructor->id}")->assertForbidden()->assertExactJson($forbidden);
        $this->putJson(self::URL."/{$instructor->id}", $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->deleteJson(self::URL."/{$instructor->id}")->assertForbidden()->assertExactJson($forbidden);

        $this->assertDatabaseCount('instructors', 1);
        $this->assertSame('Instruktur Asli', $instructor->fresh()->name);
    }

    public function test_admin_lists_instructors_with_pagination_format(): void
    {
        Instructor::factory()->count(3)->create();
        $this->actingAsAdmin();

        $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'specialization', 'phone_number', 'is_active', 'created_at', 'updated_at'],
                ],
                'links' => ['first', 'last', 'prev', 'next'],
                'meta' => ['current_page', 'from', 'last_page', 'links', 'path', 'per_page', 'to', 'total'],
            ])
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.per_page', 15);
    }

    public function test_admin_list_respects_per_page_and_page(): void
    {
        $instructors = Instructor::factory()->count(5)->create();
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?per_page=2&page=3')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $instructors->last()->id)
            ->assertJsonPath('meta.current_page', 3)
            ->assertJsonPath('meta.last_page', 3)
            ->assertJsonPath('meta.total', 5);
    }

    /**
     * Filter is_active menerima true/false maupun 1/0.
     */
    public function test_admin_can_filter_instructors_by_is_active(): void
    {
        $active = Instructor::factory()->create(['is_active' => true]);
        $inactive = Instructor::factory()->create(['is_active' => false]);
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

        $this->getJson(self::URL)->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_admin_can_search_instructors_by_name(): void
    {
        $budi = Instructor::factory()->create(['name' => 'Budi Santoso']);
        Instructor::factory()->create(['name' => 'Siti Rahma']);
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?search=BUDI')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $budi->id);

        $this->getJson(self::URL.'?search=agus')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    /**
     * Karakter % dan _ pada kata kunci dicari apa adanya, bukan sebagai wildcard.
     */
    public function test_search_treats_like_wildcards_literally(): void
    {
        $underscore = Instructor::factory()->create(['name' => 'Coach_Andi']);
        Instructor::factory()->create(['name' => 'Coach Rina']);
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?search=_')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $underscore->id);

        $this->getJson(self::URL.'?search='.urlencode('%'))
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

    public function test_admin_can_create_instructor(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload())
            ->assertCreated()
            ->assertJson([
                'message' => 'Instruktur berhasil dibuat.',
                'data' => [
                    'name' => 'Budi Santoso',
                    'specialization' => 'Yoga',
                    'phone_number' => '081234567890',
                    'is_active' => true,
                ],
            ]);

        $this->assertDatabaseHas('instructors', ['name' => 'Budi Santoso', 'phone_number' => '081234567890']);
    }

    /**
     * Hanya nama yang wajib; spesialisasi dan nomor HP boleh kosong, status default aktif.
     */
    public function test_only_name_is_required_and_instructor_is_active_by_default(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, ['name' => 'Instruktur Minimal'])
            ->assertCreated()
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.specialization', null)
            ->assertJsonPath('data.phone_number', null);
    }

    /**
     * Nomor HP berformat +62/62 dengan spasi atau tanda hubung disimpan sebagai 08xxx.
     */
    public function test_phone_number_is_normalized(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['phone_number' => '+62 812-3456-7890']))
            ->assertCreated()
            ->assertJsonPath('data.phone_number', '081234567890');
    }

    public function test_admin_can_show_instructor(): void
    {
        $instructor = Instructor::factory()->create(['specialization' => 'Pilates']);
        $this->actingAsAdmin();

        $this->getJson(self::URL."/{$instructor->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $instructor->id)
            ->assertJsonPath('data.name', $instructor->name)
            ->assertJsonPath('data.specialization', 'Pilates');
    }

    public function test_admin_can_update_instructor_and_deactivate_it(): void
    {
        $instructor = Instructor::factory()->create(['is_active' => true]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$instructor->id}", $this->validPayload([
            'name' => 'Budi S.',
            'specialization' => null,
            'is_active' => false,
        ]))
            ->assertOk()
            ->assertJson([
                'message' => 'Instruktur berhasil diperbarui.',
                'data' => ['id' => $instructor->id, 'name' => 'Budi S.', 'specialization' => null, 'is_active' => false],
            ]);

        $this->assertFalse($instructor->fresh()->is_active);
    }

    /**
     * PUT tanpa is_active tidak mengubah status aktif.
     */
    public function test_update_without_is_active_keeps_status(): void
    {
        $instructor = Instructor::factory()->create(['is_active' => false]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$instructor->id}", ['name' => 'Nama Baru'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Nama Baru')
            ->assertJsonPath('data.is_active', false);
    }

    /**
     * Instruktur yang masih punya jadwal mendatang (hari ini atau setelahnya) tidak bisa dinonaktifkan.
     *
     * @return array<string, array{0: int, 1: string}>
     */
    public static function upcomingScheduleProvider(): array
    {
        return [
            'terjadwal besok' => [1, 'scheduled'],
            'terjadwal hari ini' => [0, 'scheduled'],
            'sedang berjalan hari ini' => [0, 'ongoing'],
        ];
    }

    #[DataProvider('upcomingScheduleProvider')]
    public function test_deactivating_instructor_with_upcoming_schedule_returns_409(int $daysFromToday, string $status): void
    {
        $schedule = ClassSchedule::factory()->create([
            'schedule_date' => today()->addDays($daysFromToday)->toDateString(),
            'status' => $status,
        ]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->instructor_id}", $this->validPayload(['name' => 'Nama Baru', 'is_active' => false]))
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Instruktur tidak dapat dinonaktifkan karena masih memiliki jadwal mendatang. Silakan pindahkan jadwal ke instruktur lain atau batalkan jadwal tersebut lebih dulu.',
            ]);

        $instructor = Instructor::find($schedule->instructor_id);
        $this->assertTrue($instructor->is_active);
        $this->assertNotSame('Nama Baru', $instructor->name);
    }

    /**
     * Jadwal yang sudah lewat, selesai, atau dibatalkan tidak menghalangi penonaktifan.
     *
     * @return array<string, array{0: int, 1: string}>
     */
    public static function nonBlockingScheduleProvider(): array
    {
        return [
            'dibatalkan besok' => [1, 'cancelled'],
            'selesai hari ini' => [0, 'completed'],
            'terjadwal kemarin' => [-1, 'scheduled'],
        ];
    }

    #[DataProvider('nonBlockingScheduleProvider')]
    public function test_deactivating_instructor_without_upcoming_schedule_returns_200(int $daysFromToday, string $status): void
    {
        $schedule = ClassSchedule::factory()->create([
            'schedule_date' => today()->addDays($daysFromToday)->toDateString(),
            'status' => $status,
            'cancel_reason' => $status === 'cancelled' ? 'Instruktur sakit' : null,
        ]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->instructor_id}", $this->validPayload(['is_active' => false]))
            ->assertOk()
            ->assertJsonPath('data.is_active', false);
    }

    /**
     * Instruktur yang sudah nonaktif tetap bisa diubah (mis. ganti nama) walau masih tercatat di jadwal mendatang.
     */
    public function test_updating_already_inactive_instructor_with_upcoming_schedule_returns_200(): void
    {
        $schedule = ClassSchedule::factory()->create();
        Instructor::whereKey($schedule->instructor_id)->update(['is_active' => false]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->instructor_id}", $this->validPayload(['name' => 'Nama Baru', 'is_active' => false]))
            ->assertOk()
            ->assertJsonPath('data.name', 'Nama Baru');
    }

    /**
     * Mengubah data lain tanpa menonaktifkan tetap boleh walau instruktur punya jadwal mendatang.
     */
    public function test_updating_active_instructor_with_upcoming_schedule_returns_200(): void
    {
        $schedule = ClassSchedule::factory()->create();
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->instructor_id}", ['name' => 'Nama Baru'])
            ->assertOk()
            ->assertJsonPath('data.is_active', true);
    }

    public function test_admin_can_delete_unused_instructor(): void
    {
        $instructor = Instructor::factory()->create();
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$instructor->id}")
            ->assertOk()
            ->assertExactJson(['message' => 'Instruktur berhasil dihapus.']);

        $this->assertDatabaseMissing('instructors', ['id' => $instructor->id]);
    }

    /**
     * Instruktur yang sudah punya jadwal (termasuk yang dibatalkan) tidak dihapus.
     */
    public function test_deleting_instructor_with_schedule_returns_409(): void
    {
        $schedule = ClassSchedule::factory()->create(['status' => 'cancelled', 'cancel_reason' => 'Instruktur sakit']);
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$schedule->instructor_id}")
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Instruktur tidak dapat dihapus karena sudah memiliki jadwal. Silakan pindahkan jadwal ke instruktur lain lebih dulu, atau nonaktifkan instruktur (is_active = false) sebagai alternatif.',
            ]);

        $this->assertDatabaseHas('instructors', ['id' => $schedule->instructor_id]);
    }

    /**
     * Instruktur default suatu kelas juga ditolak 409, bukan 500 karena FK restrict.
     */
    public function test_deleting_default_instructor_of_class_returns_409(): void
    {
        $instructor = Instructor::factory()->create();
        GymClass::factory()->create(['default_instructor_id' => $instructor->id]);
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$instructor->id}")
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Instruktur tidak dapat dihapus karena masih menjadi instruktur default kelas. Silakan ganti instruktur default kelas tersebut lebih dulu, atau nonaktifkan instruktur (is_active = false) sebagai alternatif.',
            ]);

        $this->assertDatabaseHas('instructors', ['id' => $instructor->id]);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidPayloadProvider(): array
    {
        return [
            'name kosong' => [['name' => ''], 'name'],
            'name null' => [['name' => null], 'name'],
            'name bukan teks' => [['name' => ['a']], 'name'],
            'name lebih dari 100 karakter' => [['name' => str_repeat('a', 101)], 'name'],
            'specialization bukan teks' => [['specialization' => ['a']], 'specialization'],
            'specialization lebih dari 100 karakter' => [['specialization' => str_repeat('a', 101)], 'specialization'],
            'phone_number bukan nomor Indonesia' => [['phone_number' => '021555123'], 'phone_number'],
            'phone_number mengandung huruf' => [['phone_number' => '08123abc4567'], 'phone_number'],
            'phone_number terlalu panjang' => [['phone_number' => '08'.str_repeat('1', 12)], 'phone_number'],
            'phone_number bukan teks' => [['phone_number' => 81234567890], 'phone_number'],
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
        $instructor = Instructor::factory()->create(['name' => 'Instruktur Asli']);
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->putJson(self::URL."/{$instructor->id}", $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->assertDatabaseCount('instructors', 1);
        $this->assertSame('Instruktur Asli', $instructor->fresh()->name);
    }

    /**
     * Pesan validasi dalam bahasa Indonesia dan konsisten.
     */
    public function test_validation_messages_are_in_indonesian(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, ['name' => '', 'phone_number' => '12345'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'name' => 'Nama instruktur wajib diisi.',
                'phone_number' => 'Nomor HP harus nomor Indonesia yang diawali 08, +62, atau 62.',
            ]);
    }

    public function test_missing_instructor_returns_404(): void
    {
        $this->actingAsAdmin();

        $notFound = ['message' => 'Data tidak ditemukan.'];

        $this->getJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
        $this->putJson(self::URL.'/999', $this->validPayload())->assertNotFound()->assertExactJson($notFound);
        $this->deleteJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
    }
}
