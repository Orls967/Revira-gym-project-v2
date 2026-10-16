<?php

namespace Tests\Feature;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

class AdminClassScheduleTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    private const URL = '/api/v1/admin/class-schedules';

    /** Waktu "sekarang" di semua tes (WITA). */
    private const NOW = '2026-10-16 10:00:00';

    private const TODAY = '2026-10-16';

    private const TOMORROW = '2026-10-17';

    private GymClass $class;

    private Instructor $instructor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse(self::NOW));
        $this->instructor = Instructor::factory()->create(['name' => 'Budi Santoso']);
        $this->class = GymClass::factory()->create([
            'name' => 'Yoga Pagi',
            'min_participants' => 3,
            'default_instructor_id' => $this->instructor->id,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'class_id' => $this->class->id,
            'instructor_id' => $this->instructor->id,
            'schedule_date' => self::TOMORROW,
            'start_time' => '07:00',
            'end_time' => '08:00',
        ], $overrides);
    }

    /**
     * Jadwal milik instruktur utama tes dengan jam HH:MM (disimpan HH:MM:SS seperti lewat API).
     */
    private function schedule(array $attributes = []): ClassSchedule
    {
        foreach (['start_time', 'end_time'] as $field) {
            if (isset($attributes[$field]) && strlen($attributes[$field]) === 5) {
                $attributes[$field] .= ':00';
            }
        }

        return ClassSchedule::factory()->create(array_merge([
            'class_id' => $this->class->id,
            'instructor_id' => $this->instructor->id,
            'schedule_date' => self::TOMORROW,
            'start_time' => '07:00:00',
            'end_time' => '08:00:00',
            'status' => 'scheduled',
        ], $attributes));
    }

    // ---------------------------------------------------------------- akses

    /**
     * Tamu (tanpa token) ditolak 401 di semua endpoint.
     */
    public function test_guest_gets_401_on_all_endpoints(): void
    {
        $schedule = $this->schedule();

        $this->getJson(self::URL)->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        $this->postJson(self::URL, $this->validPayload())->assertUnauthorized();
        $this->getJson(self::URL."/{$schedule->id}")->assertUnauthorized();
        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload())->assertUnauthorized();
        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'cancelled', 'cancel_reason' => 'x'])->assertUnauthorized();
        $this->deleteJson(self::URL."/{$schedule->id}")->assertUnauthorized();

        $this->assertDatabaseCount('class_schedules', 1);
    }

    /**
     * Member ditolak 403 di semua endpoint dan data tidak berubah.
     */
    public function test_member_gets_403_on_all_endpoints(): void
    {
        $schedule = $this->schedule();
        $this->actingAsMember();

        $forbidden = ['message' => 'Anda tidak memiliki akses ke sumber daya ini.'];

        $this->getJson(self::URL)->assertForbidden()->assertExactJson($forbidden);
        $this->postJson(self::URL, $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->getJson(self::URL."/{$schedule->id}")->assertForbidden()->assertExactJson($forbidden);
        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload())->assertForbidden()->assertExactJson($forbidden);
        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'cancelled', 'cancel_reason' => 'x'])
            ->assertForbidden()->assertExactJson($forbidden);
        $this->deleteJson(self::URL."/{$schedule->id}")->assertForbidden()->assertExactJson($forbidden);

        $this->assertDatabaseCount('class_schedules', 1);
        $this->assertSame('scheduled', $schedule->fresh()->status);
    }

    public function test_missing_schedule_returns_404(): void
    {
        $this->actingAsAdmin();

        $notFound = ['message' => 'Data tidak ditemukan.'];

        $this->getJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
        $this->putJson(self::URL.'/999', $this->validPayload())->assertNotFound()->assertExactJson($notFound);
        $this->patchJson(self::URL.'/999/status', ['status' => 'cancelled', 'cancel_reason' => 'x'])
            ->assertNotFound()->assertExactJson($notFound);
        $this->deleteJson(self::URL.'/999')->assertNotFound()->assertExactJson($notFound);
    }

    // ---------------------------------------------------------------- daftar

    /**
     * Item daftar memuat participants_count (peserta yang tidak batal) dan min_participants dari kelas.
     */
    public function test_admin_lists_schedules_with_counts_and_pagination_format(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->count(2)->create(['class_schedule_id' => $schedule->id, 'status' => 'booked']);
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => 'attended']);
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => 'cancelled']);
        $this->actingAsAdmin();

        $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'class_id', 'class_name', 'instructor_id', 'instructor_name', 'schedule_date',
                        'start_time', 'end_time', 'status', 'cancel_reason', 'participants_count',
                        'min_participants', 'created_at', 'updated_at',
                    ],
                ],
                'links' => ['first', 'last', 'prev', 'next'],
                'meta' => ['current_page', 'from', 'last_page', 'links', 'path', 'per_page', 'to', 'total'],
            ])
            ->assertJsonPath('meta.per_page', 15)
            ->assertJsonPath('data.0', [
                'id' => $schedule->id,
                'class_id' => $this->class->id,
                'class_name' => 'Yoga Pagi',
                'instructor_id' => $this->instructor->id,
                'instructor_name' => 'Budi Santoso',
                'schedule_date' => self::TOMORROW,
                'start_time' => '07:00',
                'end_time' => '08:00',
                'status' => 'scheduled',
                'cancel_reason' => null,
                'participants_count' => 3,
                'min_participants' => 3,
                'created_at' => '2026-10-16T10:00:00+08:00',
                'updated_at' => '2026-10-16T10:00:00+08:00',
            ]);
    }

    /**
     * Terurut berdasarkan tanggal lalu jam mulai, bukan urutan dibuat.
     */
    public function test_list_is_ordered_by_date_then_start_time(): void
    {
        $late = $this->schedule(['schedule_date' => '2026-10-18', 'start_time' => '07:00', 'end_time' => '08:00']);
        $afternoon = $this->schedule(['start_time' => '16:00', 'end_time' => '17:00']);
        $morning = $this->schedule(['start_time' => '07:00', 'end_time' => '08:00']);
        $this->actingAsAdmin();

        $ids = collect($this->getJson(self::URL)->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame([$morning->id, $afternoon->id, $late->id], $ids);
    }

    public function test_admin_can_filter_by_date_range_class_and_status(): void
    {
        $otherClass = GymClass::factory()->create();
        $d17 = $this->schedule(['schedule_date' => '2026-10-17']);
        $d18 = $this->schedule(['schedule_date' => '2026-10-18', 'status' => 'cancelled', 'cancel_reason' => 'Libur']);
        $d20 = $this->schedule(['schedule_date' => '2026-10-20']);
        $other = $this->schedule(['schedule_date' => '2026-10-18', 'class_id' => $otherClass->id, 'start_time' => '09:00', 'end_time' => '10:00']);
        $this->actingAsAdmin();

        $ids = fn (string $query) => collect($this->getJson(self::URL.'?'.$query)->assertOk()->json('data'))->pluck('id')->all();

        // Rentang tanggal inklusif di kedua ujung
        $this->assertSame([$d17->id, $d18->id, $other->id], $ids('date_from=2026-10-17&date_to=2026-10-18'));
        $this->assertSame([$d20->id], $ids('date_from=2026-10-19'));
        $this->assertSame([$d17->id], $ids('date_to=2026-10-17'));
        $this->assertSame([$other->id], $ids("class_id={$otherClass->id}"));
        $this->assertSame([$d18->id], $ids('status=cancelled'));
        $this->assertSame([$d18->id], $ids("status=cancelled&class_id={$this->class->id}&date_from=2026-10-18&date_to=2026-10-18"));
    }

    public function test_admin_list_respects_per_page_and_page(): void
    {
        foreach (range(17, 21) as $day) {
            $last = $this->schedule(['schedule_date' => "2026-10-{$day}"]);
        }
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?per_page=2&page=3')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $last->id)
            ->assertJsonPath('meta.last_page', 3)
            ->assertJsonPath('meta.total', 5);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function invalidQueryProvider(): array
    {
        return [
            'date_from bukan tanggal' => ['date_from=besok', 'date_from'],
            'date_from format salah' => ['date_from=17-10-2026', 'date_from'],
            'date_to sebelum date_from' => ['date_from=2026-10-18&date_to=2026-10-17', 'date_to'],
            'class_id 0' => ['class_id=0', 'class_id'],
            'class_id bukan angka' => ['class_id=abc', 'class_id'],
            'status tidak dikenal' => ['status=postponed', 'status'],
            'per_page lebih dari 100' => ['per_page=101', 'per_page'],
            'page 0' => ['page=0', 'page'],
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

    public function test_invalid_date_from_does_not_flag_valid_date_to(): void
    {
        $this->actingAsAdmin();

        $this->getJson(self::URL.'?date_from=abc&date_to=2026-10-17')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['date_from'])
            ->assertJsonMissingValidationErrors(['date_to']);
    }

    // ---------------------------------------------------------------- buat

    public function test_admin_can_create_schedule(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload())
            ->assertCreated()
            ->assertJson([
                'message' => 'Jadwal berhasil dibuat.',
                'data' => [
                    'class_id' => $this->class->id,
                    'class_name' => 'Yoga Pagi',
                    'instructor_id' => $this->instructor->id,
                    'schedule_date' => self::TOMORROW,
                    'start_time' => '07:00',
                    'end_time' => '08:00',
                    'status' => 'scheduled',
                    'cancel_reason' => null,
                    'participants_count' => 0,
                    'min_participants' => 3,
                    'created_at' => '2026-10-16T10:00:00+08:00',
                ],
            ]);

        $this->assertDatabaseHas('class_schedules', ['start_time' => '07:00:00', 'end_time' => '08:00:00', 'status' => 'scheduled']);
    }

    /**
     * Status yang dikirim saat membuat diabaikan; jadwal baru selalu scheduled.
     */
    public function test_created_schedule_is_always_scheduled(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['status' => 'completed']))
            ->assertCreated()
            ->assertJsonPath('data.status', 'scheduled');
    }

    /**
     * Sesi hari ini boleh dibuat selama jam mulainya belum lewat.
     */
    public function test_schedule_today_with_future_start_time_is_allowed(): void
    {
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['schedule_date' => self::TODAY, 'start_time' => '10:30', 'end_time' => '11:30']))
            ->assertCreated();
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string, 2?: string}>
     */
    public static function invalidPayloadProvider(): array
    {
        return [
            'class_id kosong' => [['class_id' => null], 'class_id'],
            'class_id tidak ada' => [['class_id' => 999], 'class_id', 'Kelas tidak ditemukan atau tidak aktif.'],
            'instructor_id kosong' => [['instructor_id' => null], 'instructor_id'],
            'instructor_id tidak ada' => [['instructor_id' => 999], 'instructor_id', 'Instruktur tidak ditemukan atau tidak aktif.'],
            'schedule_date kosong' => [['schedule_date' => null], 'schedule_date'],
            'schedule_date format salah' => [['schedule_date' => '17/10/2026'], 'schedule_date', 'Tanggal jadwal harus berformat YYYY-MM-DD.'],
            'schedule_date kemarin' => [['schedule_date' => '2026-10-15'], 'schedule_date', 'Tanggal jadwal tidak boleh di masa lalu.'],
            'start_time kosong' => [['start_time' => null], 'start_time'],
            'start_time format salah' => [['start_time' => '7 pagi'], 'start_time', 'Jam mulai harus berformat HH:MM.'],
            'start_time dengan detik' => [['start_time' => '07:00:00'], 'start_time'],
            'end_time format salah' => [['end_time' => '25:00'], 'end_time', 'Jam selesai harus berformat HH:MM.'],
            'end_time sama dengan start_time' => [['end_time' => '07:00'], 'end_time', 'Jam selesai harus setelah jam mulai.'],
            'end_time sebelum start_time' => [['end_time' => '06:00'], 'end_time', 'Jam selesai harus setelah jam mulai.'],
            'jam mulai hari ini sudah lewat' => [['schedule_date' => '2026-10-16', 'start_time' => '09:00', 'end_time' => '11:00'], 'start_time', 'Jam mulai sudah lewat.'],
        ];
    }

    /**
     * Setiap aturan validasi ditolak 422 dengan pesan yang konsisten, baik saat buat maupun ubah.
     *
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('invalidPayloadProvider')]
    public function test_invalid_payload_is_rejected_with_422(array $overrides, string $field, ?string $message = null): void
    {
        $schedule = $this->schedule(['schedule_date' => '2026-10-20']);
        $this->actingAsAdmin();

        $expected = $message ? [$field => $message] : [$field];

        $this->postJson(self::URL, $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($expected);

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload($overrides))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($expected);

        $this->assertDatabaseCount('class_schedules', 1);
        $this->assertSame('2026-10-20', $schedule->fresh()->schedule_date->format('Y-m-d'));
    }

    public function test_create_with_inactive_class_or_instructor_returns_422(): void
    {
        $inactiveClass = GymClass::factory()->create(['is_active' => false]);
        $inactiveInstructor = Instructor::factory()->create(['is_active' => false]);
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['class_id' => $inactiveClass->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['class_id' => 'Kelas tidak ditemukan atau tidak aktif.']);

        $this->postJson(self::URL, $this->validPayload(['instructor_id' => $inactiveInstructor->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['instructor_id' => 'Instruktur tidak ditemukan atau tidak aktif.']);

        $this->assertDatabaseCount('class_schedules', 0);
    }

    // ---------------------------------------------------------------- tumpang tindih

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function overlappingSlotProvider(): array
    {
        // Jadwal yang sudah ada: 07:00-08:00
        return [
            'sama persis' => ['07:00', '08:00'],
            'mulai di tengah' => ['07:30', '08:30'],
            'selesai di tengah' => ['06:30', '07:30'],
            'di dalam' => ['07:15', '07:45'],
            'melingkupi' => ['06:00', '09:00'],
        ];
    }

    #[DataProvider('overlappingSlotProvider')]
    public function test_overlapping_schedule_for_same_instructor_returns_422(string $start, string $end): void
    {
        $this->schedule();
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['start_time' => $start, 'end_time' => $end]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'instructor_id' => 'Instruktur sudah memiliki jadwal lain pada 2026-10-17 pukul 07:00-08:00 yang bertumpuk dengan jadwal ini.',
            ]);

        $this->assertDatabaseCount('class_schedules', 1);
    }

    /**
     * Jam yang hanya bersentuhan, instruktur lain, hari lain, atau jadwal yang dibatalkan tidak dianggap bentrok.
     */
    public function test_non_overlapping_schedules_are_allowed(): void
    {
        $this->schedule();
        $this->schedule(['start_time' => '12:00', 'end_time' => '13:00', 'status' => 'cancelled', 'cancel_reason' => 'Libur']);
        $otherInstructor = Instructor::factory()->create();
        $this->actingAsAdmin();

        $this->postJson(self::URL, $this->validPayload(['start_time' => '08:00', 'end_time' => '09:00']))->assertCreated();
        $this->postJson(self::URL, $this->validPayload(['start_time' => '06:00', 'end_time' => '07:00']))->assertCreated();
        $this->postJson(self::URL, $this->validPayload(['instructor_id' => $otherInstructor->id]))->assertCreated();
        $this->postJson(self::URL, $this->validPayload(['schedule_date' => '2026-10-18']))->assertCreated();
        $this->postJson(self::URL, $this->validPayload(['start_time' => '12:00', 'end_time' => '13:00']))->assertCreated();

        $this->assertDatabaseCount('class_schedules', 7);
    }

    // ---------------------------------------------------------------- detail & ubah

    public function test_admin_can_show_schedule(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id]);
        $this->actingAsAdmin();

        $this->getJson(self::URL."/{$schedule->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $schedule->id)
            ->assertJsonPath('data.instructor_name', 'Budi Santoso')
            ->assertJsonPath('data.participants_count', 1);
    }

    public function test_admin_can_update_schedule(): void
    {
        $schedule = $this->schedule();
        $otherInstructor = Instructor::factory()->create(['name' => 'Siti Rahma']);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload([
            'instructor_id' => $otherInstructor->id,
            'schedule_date' => '2026-10-19',
            'start_time' => '18:00',
            'end_time' => '19:30',
        ]))
            ->assertOk()
            ->assertJson([
                'message' => 'Jadwal berhasil diperbarui.',
                'data' => [
                    'id' => $schedule->id,
                    'instructor_name' => 'Siti Rahma',
                    'schedule_date' => '2026-10-19',
                    'start_time' => '18:00',
                    'end_time' => '19:30',
                    'status' => 'scheduled',
                ],
            ]);
    }

    /**
     * Menggeser jadwal sedikit tidak bentrok dengan dirinya sendiri, tetapi tetap bentrok dengan jadwal lain.
     */
    public function test_update_overlap_check_excludes_itself(): void
    {
        $schedule = $this->schedule();
        $this->schedule(['start_time' => '09:00', 'end_time' => '10:00']);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['start_time' => '07:30', 'end_time' => '08:30']))
            ->assertOk();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['start_time' => '08:30', 'end_time' => '09:30']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['instructor_id']);

        $this->assertSame('07:30:00', $schedule->fresh()->start_time);
    }

    /**
     * Jadwal yang sudah punya peserta (termasuk yang membatalkan booking) tidak boleh diganti kelasnya,
     * agar peserta yang booking kelas A tidak berpindah ke kelas B. Tidak ada field yang berubah.
     *
     * @return array<string, array{0: string}>
     */
    public static function anyParticipantStatusProvider(): array
    {
        return [
            'booked' => ['booked'],
            'attended' => ['attended'],
            'cancelled' => ['cancelled'],
        ];
    }

    #[DataProvider('anyParticipantStatusProvider')]
    public function test_update_changing_class_of_schedule_with_participants_returns_422(string $participantStatus): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => $participantStatus]);
        $otherClass = GymClass::factory()->create(['default_instructor_id' => $this->instructor->id]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload([
            'class_id' => $otherClass->id,
            'start_time' => '09:00',
            'end_time' => '10:00',
        ]))
            ->assertUnprocessable()
            ->assertOnlyJsonValidationErrors(['class_id' => 'Kelas jadwal tidak dapat diganti karena jadwal sudah memiliki peserta. Batalkan jadwal ini lalu buat jadwal baru untuk kelas lain.']);

        $fresh = $schedule->fresh();
        $this->assertSame($this->class->id, $fresh->class_id);
        $this->assertSame('07:00:00', $fresh->start_time);
    }

    /**
     * Jadwal berpeserta tetap bisa digeser tanggal, jam, dan instrukturnya selama kelasnya sama.
     */
    public function test_update_schedule_with_participants_can_move_date_time_and_instructor(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id]);
        $otherInstructor = Instructor::factory()->create(['name' => 'Siti Rahma']);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload([
            'instructor_id' => $otherInstructor->id,
            'schedule_date' => '2026-10-19',
            'start_time' => '18:00',
            'end_time' => '19:30',
        ]))
            ->assertOk()
            ->assertJsonPath('data.class_id', $this->class->id)
            ->assertJsonPath('data.instructor_name', 'Siti Rahma')
            ->assertJsonPath('data.schedule_date', '2026-10-19')
            ->assertJsonPath('data.participants_count', 1);
    }

    /**
     * Jadwal tanpa peserta tetap boleh diganti kelasnya; class_id dikirim sebagai string pun tidak dianggap berganti.
     */
    public function test_update_changing_class_of_schedule_without_participants_is_allowed(): void
    {
        $schedule = $this->schedule();
        $otherClass = GymClass::factory()->create(['name' => 'Zumba Sore', 'default_instructor_id' => $this->instructor->id]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['class_id' => $otherClass->id]))
            ->assertOk()
            ->assertJsonPath('data.class_name', 'Zumba Sore');

        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id]);

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['class_id' => (string) $otherClass->id, 'start_time' => '09:00', 'end_time' => '10:00']))
            ->assertOk()
            ->assertJsonPath('data.start_time', '09:00');
    }

    /**
     * Kelas/instruktur yang sudah terpasang boleh dipertahankan walau kini nonaktif; mengganti ke yang nonaktif ditolak.
     */
    public function test_update_keeping_inactive_class_and_instructor_is_allowed(): void
    {
        $schedule = $this->schedule();
        $this->class->update(['is_active' => false]);
        $this->instructor->update(['is_active' => false]);
        $otherInactive = Instructor::factory()->create(['is_active' => false]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['start_time' => '09:00', 'end_time' => '10:00']))
            ->assertOk();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['instructor_id' => $otherInactive->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['instructor_id' => 'Instruktur tidak ditemukan atau tidak aktif.']);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function nonEditableStatusProvider(): array
    {
        return [
            'ongoing' => ['ongoing'],
            'completed' => ['completed'],
            'cancelled' => ['cancelled'],
        ];
    }

    #[DataProvider('nonEditableStatusProvider')]
    public function test_only_scheduled_schedule_can_be_updated(string $status): void
    {
        $schedule = $this->schedule(['status' => $status, 'cancel_reason' => $status === 'cancelled' ? 'Libur' : null]);
        $this->actingAsAdmin();

        $this->putJson(self::URL."/{$schedule->id}", $this->validPayload(['start_time' => '09:00', 'end_time' => '10:00']))
            ->assertStatus(409)
            ->assertExactJson([
                'message' => "Jadwal berstatus {$status} tidak dapat diubah. Hanya jadwal berstatus scheduled yang dapat diubah.",
            ]);

        $this->assertSame('07:00:00', $schedule->fresh()->start_time);
    }

    // ---------------------------------------------------------------- status

    public function test_admin_can_cancel_schedule_with_reason(): void
    {
        $schedule = $this->schedule();
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'cancelled', 'cancel_reason' => 'Instruktur berhalangan hadir'])
            ->assertOk()
            ->assertJson([
                'message' => 'Status jadwal berhasil diperbarui.',
                'data' => ['id' => $schedule->id, 'status' => 'cancelled', 'cancel_reason' => 'Instruktur berhalangan hadir'],
            ]);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidStatusPayloadProvider(): array
    {
        return [
            'status kosong' => [[], 'status'],
            'status tidak dikenal' => [['status' => 'postponed'], 'status'],
            'batal tanpa alasan' => [['status' => 'cancelled'], 'cancel_reason'],
            'batal dengan alasan kosong' => [['status' => 'cancelled', 'cancel_reason' => ''], 'cancel_reason'],
            'alasan lebih dari 255 karakter' => [['status' => 'cancelled', 'cancel_reason' => str_repeat('a', 256)], 'cancel_reason'],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('invalidStatusPayloadProvider')]
    public function test_invalid_status_payload_returns_422(array $payload, string $field): void
    {
        $schedule = $this->schedule();
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field]);

        $this->assertSame('scheduled', $schedule->fresh()->status);
    }

    public function test_cancel_without_reason_has_clear_message(): void
    {
        $schedule = $this->schedule();
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'cancelled'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cancel_reason' => 'Alasan pembatalan wajib diisi bila jadwal dibatalkan.']);
    }

    /**
     * Jadwal batal bisa diaktifkan lagi sebelum waktu mulai; alasan pembatalan dihapus.
     */
    public function test_cancelled_schedule_can_be_rescheduled_before_start(): void
    {
        $schedule = $this->schedule(['status' => 'cancelled', 'cancel_reason' => 'Hujan deras']);
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'scheduled', 'cancel_reason' => 'diabaikan'])
            ->assertOk()
            ->assertJsonPath('data.status', 'scheduled')
            ->assertJsonPath('data.cancel_reason', null);
    }

    public function test_cancelled_schedule_cannot_be_rescheduled_after_start(): void
    {
        $schedule = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '09:00', 'end_time' => '11:00', 'status' => 'cancelled', 'cancel_reason' => 'Hujan']);
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'scheduled'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Jadwal yang dibatalkan hanya dapat diaktifkan kembali sebelum waktu mulai.']);

        $this->assertSame('cancelled', $schedule->fresh()->status);
    }

    /**
     * Slot instruktur bisa terisi jadwal lain selama jadwal ini batal; mengaktifkannya lagi tidak boleh menimbulkan bentrok.
     */
    public function test_rescheduling_into_overlap_returns_422(): void
    {
        $cancelled = $this->schedule(['status' => 'cancelled', 'cancel_reason' => 'Hujan']);
        $this->schedule(['start_time' => '07:30', 'end_time' => '08:30']);
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$cancelled->id}/status", ['status' => 'scheduled'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Instruktur sudah memiliki jadwal lain pada 2026-10-17 pukul 07:30-08:30 yang bertumpuk dengan jadwal ini.']);
    }

    public function test_rescheduling_with_inactive_class_or_instructor_returns_422(): void
    {
        $schedule = $this->schedule(['status' => 'cancelled', 'cancel_reason' => 'Hujan']);
        $this->actingAsAdmin();

        $this->class->update(['is_active' => false]);
        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'scheduled'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Kelas jadwal ini sudah nonaktif. Aktifkan kelas lebih dulu.']);

        $this->class->update(['is_active' => true]);
        $this->instructor->update(['is_active' => false]);
        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'scheduled'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Instruktur jadwal ini sudah nonaktif. Ganti instruktur atau aktifkan kembali lebih dulu.']);
    }

    /**
     * Sesi yang sudah dimulai bisa ditandai ongoing lalu completed.
     */
    public function test_started_schedule_can_be_marked_ongoing_then_completed(): void
    {
        $schedule = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '09:00', 'end_time' => '11:00']);
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'ongoing'])
            ->assertOk()->assertJsonPath('data.status', 'ongoing');

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'completed'])
            ->assertOk()->assertJsonPath('data.status', 'completed');
    }

    public function test_future_schedule_cannot_be_marked_ongoing_or_completed(): void
    {
        $schedule = $this->schedule();
        $this->actingAsAdmin();

        foreach (['ongoing', 'completed'] as $status) {
            $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => $status])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['status' => "Jadwal belum dimulai, sehingga belum dapat diubah ke {$status}."]);
        }

        $this->assertSame('scheduled', $schedule->fresh()->status);
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function forbiddenTransitionProvider(): array
    {
        return [
            'completed ke scheduled' => ['completed', 'scheduled'],
            'completed ke cancelled' => ['completed', 'cancelled'],
            'completed ke ongoing' => ['completed', 'ongoing'],
            'cancelled ke ongoing' => ['cancelled', 'ongoing'],
            'cancelled ke completed' => ['cancelled', 'completed'],
            'ongoing ke scheduled' => ['ongoing', 'scheduled'],
        ];
    }

    #[DataProvider('forbiddenTransitionProvider')]
    public function test_forbidden_transition_returns_422(string $from, string $to): void
    {
        $schedule = $this->schedule(['status' => $from, 'cancel_reason' => $from === 'cancelled' ? 'Hujan' : null]);
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => $to, 'cancel_reason' => 'Alasan'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => "Status jadwal tidak dapat diubah dari {$from} ke {$to}."]);

        $this->assertSame($from, $schedule->fresh()->status);
    }

    public function test_same_status_returns_422(): void
    {
        $schedule = $this->schedule();
        $this->actingAsAdmin();

        $this->patchJson(self::URL."/{$schedule->id}/status", ['status' => 'scheduled'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Jadwal sudah berstatus scheduled.']);
    }

    // ---------------------------------------------------------------- hapus

    public function test_admin_can_delete_schedule_without_participants(): void
    {
        $schedule = $this->schedule();
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$schedule->id}")
            ->assertOk()
            ->assertExactJson(['message' => 'Jadwal berhasil dihapus.']);

        $this->assertDatabaseMissing('class_schedules', ['id' => $schedule->id]);
    }

    /**
     * Jadwal berpeserta tidak dihapus, termasuk bila pesertanya sudah membatalkan booking (FK restrict).
     *
     * @return array<string, array{0: string}>
     */
    public static function participantStatusProvider(): array
    {
        return [
            'booked' => ['booked'],
            'cancelled' => ['cancelled'],
        ];
    }

    #[DataProvider('participantStatusProvider')]
    public function test_deleting_schedule_with_participants_returns_409(string $participantStatus): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => $participantStatus]);
        $this->actingAsAdmin();

        $this->deleteJson(self::URL."/{$schedule->id}")
            ->assertStatus(409)
            ->assertExactJson([
                'message' => 'Jadwal tidak dapat dihapus karena sudah memiliki peserta. Batalkan jadwal lewat PATCH /admin/class-schedules/{id}/status dengan status cancelled.',
            ]);

        $this->assertDatabaseHas('class_schedules', ['id' => $schedule->id]);
    }
}
