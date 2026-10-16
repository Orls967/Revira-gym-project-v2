<?php

namespace Tests\Feature;

use App\Models\ClassParticipant;
use App\Models\ClassSchedule;
use App\Models\GymClass;
use App\Models\Instructor;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\InteractsWithApiAuth;
use Tests\TestCase;

class PublicClassScheduleTest extends TestCase
{
    use InteractsWithApiAuth;
    use RefreshDatabase;

    private const URL = '/api/v1/class-schedules';

    private const STATUS_URL = '/api/v1/class-schedules/status';

    /** Waktu "sekarang" di semua tes (WITA). */
    private const NOW = '2026-10-16 10:00:00';

    private const TODAY = '2026-10-16';

    private GymClass $class;

    private Instructor $instructor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse(self::NOW));
        $this->instructor = Instructor::factory()->create(['name' => 'Budi Santoso', 'phone_number' => '081234567890']);
        $this->class = GymClass::factory()->create([
            'name' => 'Yoga Pagi',
            'min_participants' => 3,
            'default_instructor_id' => $this->instructor->id,
        ]);
    }

    private function schedule(array $attributes = []): ClassSchedule
    {
        return ClassSchedule::factory()->create(array_merge([
            'class_id' => $this->class->id,
            'instructor_id' => $this->instructor->id,
            'schedule_date' => '2026-10-17',
            'start_time' => '07:00:00',
            'end_time' => '08:00:00',
            'status' => 'scheduled',
        ], $attributes));
    }

    /**
     * @return array<int, int>
     */
    private function ids(TestResponse $response): array
    {
        return array_column($response->json('data'), 'id');
    }

    // ---------------------------------------------------------------------
    // GET /class-schedules
    // ---------------------------------------------------------------------

    /**
     * Daftar publik bisa diakses tanpa token dan hanya memuat field publik (tanpa kontak instruktur atau data peserta).
     */
    public function test_public_list_is_accessible_without_token_and_has_no_sensitive_fields(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->count(2)->create(['class_schedule_id' => $schedule->id]);

        $response = $this->getJson(self::URL);

        $response->assertOk()->assertExactJson(['data' => [[
            'id' => $schedule->id,
            'class_id' => $this->class->id,
            'class_name' => 'Yoga Pagi',
            'instructor_name' => 'Budi Santoso',
            'schedule_date' => '2026-10-17',
            'start_time' => '07:00',
            'end_time' => '08:00',
            'status' => 'scheduled',
            'cancel_reason' => null,
            'participants_count' => 2,
            'min_participants' => 3,
            'updated_at' => '2026-10-16T10:00:00+08:00',
        ]]]);
        $this->assertStringNotContainsString('081234567890', $response->getContent());
    }

    /**
     * Tanpa filter, daftar memuat 7 hari: hari ini sampai 6 hari ke depan, terurut tanggal lalu jam mulai.
     */
    public function test_public_list_defaults_to_next_seven_days_in_chronological_order(): void
    {
        $this->schedule(['schedule_date' => '2026-10-15']);
        $lastDay = $this->schedule(['schedule_date' => '2026-10-22']);
        $this->schedule(['schedule_date' => '2026-10-23']);
        $todayLate = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '18:00:00', 'end_time' => '19:00:00']);
        $todayEarly = $this->schedule(['schedule_date' => self::TODAY, 'start_time' => '06:00:00', 'end_time' => '07:00:00']);

        $response = $this->getJson(self::URL);

        $response->assertOk();
        $this->assertSame([$todayEarly->id, $todayLate->id, $lastDay->id], $this->ids($response));
    }

    /**
     * Jadwal yang dibatalkan tetap tampil dengan alasannya; peserta yang membatalkan booking tidak dihitung.
     */
    public function test_public_list_shows_cancelled_schedules_with_reason_and_counts_only_active_participants(): void
    {
        $schedule = $this->schedule(['status' => 'cancelled', 'cancel_reason' => 'Instruktur berhalangan hadir']);
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => 'booked']);
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => 'attended']);
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id, 'status' => 'cancelled']);

        $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.cancel_reason', 'Instruktur berhalangan hadir')
            ->assertJsonPath('data.0.participants_count', 2);
    }

    /**
     * date_from dan date_to inklusif.
     */
    public function test_public_list_filters_by_inclusive_date_range(): void
    {
        $this->schedule(['schedule_date' => '2026-10-17']);
        $from = $this->schedule(['schedule_date' => '2026-10-18']);
        $to = $this->schedule(['schedule_date' => '2026-10-20']);
        $this->schedule(['schedule_date' => '2026-10-21']);

        $response = $this->getJson(self::URL.'?date_from=2026-10-18&date_to=2026-10-20');

        $response->assertOk();
        $this->assertSame([$from->id, $to->id], $this->ids($response));
    }

    /**
     * Parameter kosong dianggap tidak dikirim; bila hanya satu sisi dikirim, sisi lain dihitung 7 hari dari sisi itu.
     */
    #[DataProvider('oneSidedRanges')]
    public function test_public_list_fills_missing_side_with_seven_day_window(string $query, array $expectedDates): void
    {
        foreach (['2026-10-09', '2026-10-10', '2026-10-16', '2026-10-20', '2026-10-26', '2026-10-27'] as $date) {
            $this->schedule(['schedule_date' => $date]);
        }

        $response = $this->getJson(self::URL.'?'.$query);

        $response->assertOk();
        $this->assertSame($expectedDates, array_column($response->json('data'), 'schedule_date'));
    }

    public static function oneSidedRanges(): array
    {
        return [
            'parameter kosong' => ['date_from=&date_to=', ['2026-10-16', '2026-10-20']],
            'hanya date_from' => ['date_from=2026-10-20', ['2026-10-20', '2026-10-26']],
            'hanya date_to' => ['date_to=2026-10-16', ['2026-10-10', '2026-10-16']],
        ];
    }

    /**
     * Rentang tanggal tidak valid atau terlalu panjang ditolak 422.
     */
    #[DataProvider('invalidRanges')]
    public function test_public_list_rejects_invalid_ranges(string $query, string $field, string $message): void
    {
        $this->getJson(self::URL.'?'.$query)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([$field => $message]);
    }

    public static function invalidRanges(): array
    {
        return [
            'format date_from' => ['date_from=16-10-2026', 'date_from', 'Tanggal awal harus berformat YYYY-MM-DD.'],
            'format date_to' => ['date_to=2026-13-01', 'date_to', 'Tanggal akhir harus berformat YYYY-MM-DD.'],
            'date_to sebelum date_from' => ['date_from=2026-10-20&date_to=2026-10-19', 'date_to', 'Tanggal akhir tidak boleh sebelum tanggal awal.'],
            'lebih dari 31 hari' => ['date_from=2026-10-01&date_to=2026-11-01', 'date_to', 'Rentang tanggal maksimal 31 hari.'],
        ];
    }

    /**
     * Rentang tepat 31 hari (inklusif) masih diterima.
     */
    public function test_public_list_accepts_thirty_one_day_range(): void
    {
        $first = $this->schedule(['schedule_date' => '2026-10-01']);
        $last = $this->schedule(['schedule_date' => '2026-10-31']);

        $response = $this->getJson(self::URL.'?date_from=2026-10-01&date_to=2026-10-31');

        $response->assertOk();
        $this->assertSame([$first->id, $last->id], $this->ids($response));
    }

    /**
     * Jumlah query tetap walau jadwal bertambah (tanpa N+1). Jadwal tambahan berada di dalam jendela default
     * 7 hari (17-21 Oktober) sehingga benar-benar diambil endpoint; nama kelas, nama instruktur, min_participants,
     * dan participants_count tiap jadwal juga dicek agar tes gagal bila eager load atau withCount dihapus.
     */
    public function test_public_endpoints_do_not_run_queries_per_schedule(): void
    {
        $responses = [];
        $count = function (string $url) use (&$responses): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $responses[$url] = $this->getJson($url)->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $this->schedule();
        $listOne = $count(self::URL);
        $statusOne = $count(self::STATUS_URL);

        foreach (range(1, 5) as $day) {
            $other = GymClass::factory()->create([
                'name' => "Kelas {$day}",
                'min_participants' => 10 + $day,
                'default_instructor_id' => Instructor::factory()->create(['name' => "Instruktur {$day}"])->id,
            ]);
            $schedule = $this->schedule([
                'class_id' => $other->id,
                'instructor_id' => $other->default_instructor_id,
                'schedule_date' => sprintf('2026-10-%02d', 16 + $day),
                'start_time' => '12:00:00',
                'end_time' => '13:00:00',
            ]);
            ClassParticipant::factory()->count($day)->create(['class_schedule_id' => $schedule->id]);
        }

        $this->assertSame($listOne, $count(self::URL));
        $this->assertSame($statusOne, $count(self::STATUS_URL));

        $expected = [
            ['Yoga Pagi', 'Budi Santoso', 3, 0],
            ['Kelas 1', 'Instruktur 1', 11, 1],
            ['Kelas 2', 'Instruktur 2', 12, 2],
            ['Kelas 3', 'Instruktur 3', 13, 3],
            ['Kelas 4', 'Instruktur 4', 14, 4],
            ['Kelas 5', 'Instruktur 5', 15, 5],
        ];
        $list = $responses[self::URL]->json('data');
        $status = $responses[self::STATUS_URL]->json('data');
        $this->assertCount(6, $list);
        $this->assertCount(6, $status);
        $this->assertSame($expected, array_map(
            fn (array $item) => [$item['class_name'], $item['instructor_name'], $item['min_participants'], $item['participants_count']],
            $list,
        ));
        $this->assertSame(array_column($expected, 2), array_column($status, 'min_participants'));
        $this->assertSame(array_column($expected, 3), array_column($status, 'participants_count'));
    }

    /**
     * Member yang login tetap mendapat data publik yang sama.
     */
    public function test_public_list_also_works_with_member_token(): void
    {
        $this->schedule();
        $this->actingAsMember();

        $this->getJson(self::URL)->assertOk()->assertJsonCount(1, 'data');
    }

    // ---------------------------------------------------------------------
    // GET /class-schedules/status
    // ---------------------------------------------------------------------

    /**
     * Respons polling ringkas tanpa token: hanya id, status, participants_count, min_participants, updated_at.
     */
    public function test_status_returns_lightweight_items_without_token(): void
    {
        $schedule = $this->schedule();
        ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id]);
        $schedule->refresh();

        $this->getJson(self::STATUS_URL)
            ->assertOk()
            ->assertHeader('ETag')
            ->assertExactJson(['data' => [[
                'id' => $schedule->id,
                'status' => 'scheduled',
                'participants_count' => 1,
                'min_participants' => 3,
                'updated_at' => '2026-10-16T10:00:00+08:00',
            ]]]);
    }

    /**
     * Rentang tanggal polling sama dengan daftar publik (default 7 hari, validasi sama).
     */
    public function test_status_uses_same_date_range_as_public_list(): void
    {
        $inRange = $this->schedule(['schedule_date' => '2026-10-22']);
        $this->schedule(['schedule_date' => '2026-10-23']);

        $this->assertSame([$inRange->id], $this->ids($this->getJson(self::STATUS_URL)));

        $this->getJson(self::STATUS_URL.'?date_from=2026-10-01&date_to=2026-11-01')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['date_to' => 'Rentang tanggal maksimal 31 hari.']);
    }

    /**
     * Dengan updated_since, hanya jadwal yang berubah sejak waktu itu yang muncul.
     */
    public function test_status_returns_only_schedules_changed_since_updated_since(): void
    {
        $unchanged = $this->schedule();
        $changed = $this->schedule(['start_time' => '09:00:00', 'end_time' => '10:00:00']);

        $this->travel(5)->minutes();
        $changed->update(['status' => 'cancelled', 'cancel_reason' => 'Ruangan dipakai']);

        $response = $this->getJson(self::STATUS_URL.'?updated_since='.urlencode('2026-10-16T10:01:00+08:00'));

        $response->assertOk()
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.updated_at', '2026-10-16T10:05:00+08:00');
        $this->assertSame([$changed->id], $this->ids($response));
        $this->assertNotContains($unchanged->id, $this->ids($response));
    }

    /**
     * updated_since inklusif: perubahan pada detik yang sama tidak terlewat.
     */
    public function test_status_updated_since_is_inclusive(): void
    {
        $schedule = $this->schedule();

        $response = $this->getJson(self::STATUS_URL.'?updated_since='.urlencode('2026-10-16T10:00:00+08:00'));

        $this->assertSame([$schedule->id], $this->ids($response));
    }

    /**
     * Offset lain (Z), pecahan detik, dan "+" yang tidak di-encode (terbaca spasi) tetap dipahami.
     */
    #[DataProvider('updatedSinceVariants')]
    public function test_status_accepts_updated_since_variants(string $rawQueryValue, bool $expectIncluded): void
    {
        $schedule = $this->schedule();

        $response = $this->getJson(self::STATUS_URL.'?updated_since='.$rawQueryValue);

        $response->assertOk();
        $this->assertSame($expectIncluded ? [$schedule->id] : [], $this->ids($response));
    }

    public static function updatedSinceVariants(): array
    {
        return [
            // 02:00 UTC = 10:00 WITA
            'kosong (semua jadwal)' => ['', true],
            'UTC Z sama dengan updated_at' => ['2026-10-16T02:00:00Z', true],
            'UTC Z setelah updated_at' => ['2026-10-16T02:00:01Z', false],
            '+ tidak di-encode' => ['2026-10-16T10:00:00+08:00', true],
            'pecahan detik' => [urlencode('2026-10-16T09:59:59.500+08:00'), true],
            'mikrodetik' => [urlencode('2026-10-16T10:00:01.000000+08:00'), false],
        ];
    }

    /**
     * updated_since yang bukan ISO 8601 dengan offset ditolak 422.
     */
    #[DataProvider('invalidUpdatedSince')]
    public function test_status_rejects_invalid_updated_since(string $value): void
    {
        $this->getJson(self::STATUS_URL.'?updated_since='.urlencode($value))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['updated_since' => 'updated_since harus berformat ISO 8601 dengan offset, mis. 2026-10-16T10:00:00+08:00.']);
    }

    public static function invalidUpdatedSince(): array
    {
        return [
            'tanpa offset' => ['2026-10-16T10:00:00'],
            'hanya tanggal' => ['2026-10-16'],
            'teks' => ['kemarin'],
        ];
    }

    /**
     * If-None-Match dengan ETag yang sama dibalas 304 tanpa body; setelah ada perubahan, 200 dengan ETag baru.
     */
    public function test_status_returns_304_when_etag_matches_and_200_after_change(): void
    {
        $schedule = $this->schedule();

        $first = $this->getJson(self::STATUS_URL)->assertOk();
        $etag = $first->headers->get('ETag');
        $this->assertNotEmpty($etag);

        $notModified = $this->getJson(self::STATUS_URL, ['If-None-Match' => $etag]);
        $notModified->assertStatus(304);
        $this->assertSame('', $notModified->getContent());

        $this->travel(1)->minutes();
        $schedule->update(['status' => 'ongoing']);

        $changed = $this->getJson(self::STATUS_URL, ['If-None-Match' => $etag]);
        $changed->assertOk()->assertJsonPath('data.0.status', 'ongoing');
        $this->assertNotSame($etag, $changed->headers->get('ETag'));
    }

    /**
     * Request lintas origin dari origin yang diizinkan dapat membaca header ETag (CORS Access-Control-Expose-Headers).
     */
    public function test_status_exposes_etag_header_to_cors_clients(): void
    {
        config(['cors.allowed_origins' => ['http://localhost:5173']]);
        $this->schedule();

        $this->getJson(self::STATUS_URL, ['Origin' => 'http://localhost:5173'])
            ->assertOk()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Expose-Headers', 'ETag');
    }

    /**
     * ETag yang tidak cocok tetap dibalas 200 dengan body.
     */
    public function test_status_returns_200_when_etag_does_not_match(): void
    {
        $this->schedule();

        $this->getJson(self::STATUS_URL, ['If-None-Match' => '"etag-lama"'])
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /**
     * Pembatalan oleh admin lewat PATCH status muncul di respons polling berikutnya.
     */
    public function test_admin_cancellation_appears_in_next_status_response(): void
    {
        $schedule = $this->schedule();
        $admin = $this->createAdmin();

        $first = $this->getJson(self::STATUS_URL)->assertOk();
        $cursor = $first->json('data.0.updated_at');

        $this->travel(2)->minutes();
        $this->patchJson("/api/v1/admin/class-schedules/{$schedule->id}/status", [
            'status' => 'cancelled',
            'cancel_reason' => 'Instruktur berhalangan hadir',
        ], $this->bearerHeaders($admin))->assertOk();

        $next = $this->getJson(
            self::STATUS_URL.'?updated_since='.urlencode($cursor),
            ['If-None-Match' => $first->headers->get('ETag')],
        );

        $next->assertOk()
            ->assertJsonPath('data.0.id', $schedule->id)
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.updated_at', '2026-10-16T10:02:00+08:00');

        $this->getJson(self::URL)
            ->assertJsonPath('data.0.status', 'cancelled')
            ->assertJsonPath('data.0.cancel_reason', 'Instruktur berhalangan hadir');
    }

    /**
     * Booking baru, pembatalan booking, dan penghapusan peserta memperbarui updated_at jadwal
     * sehingga perubahan participants_count terdeteksi lewat updated_since.
     */
    public function test_participant_changes_touch_schedule_and_are_detected(): void
    {
        $schedule = $this->schedule();
        $other = $this->schedule(['start_time' => '09:00:00', 'end_time' => '10:00:00']);
        $since = fn () => self::STATUS_URL.'?updated_since='.urlencode(now()->toIso8601String());

        // Booking baru
        $this->travel(1)->minutes();
        $url = $since();
        $participant = ClassParticipant::factory()->create(['class_schedule_id' => $schedule->id]);
        $response = $this->getJson($url);
        $this->assertSame([$schedule->id], $this->ids($response));
        $response->assertJsonPath('data.0.participants_count', 1);

        // Pembatalan booking
        $this->travel(1)->minutes();
        $url = $since();
        $participant->update(['status' => 'cancelled']);
        $response = $this->getJson($url);
        $this->assertSame([$schedule->id], $this->ids($response));
        $response->assertJsonPath('data.0.participants_count', 0);

        // Penghapusan baris peserta
        $this->travel(1)->minutes();
        $url = $since();
        $participant->delete();
        $this->assertSame([$schedule->id], $this->ids($this->getJson($url)));

        $this->assertTrue($other->fresh()->updated_at->equalTo(CarbonImmutable::parse(self::NOW)));
    }

    /**
     * Perubahan min_participants kelas memperbarui jadwal yang belum lewat agar ikut terdeteksi polling.
     */
    public function test_min_participants_change_touches_upcoming_schedules_of_that_class(): void
    {
        $past = $this->schedule(['schedule_date' => '2026-10-15']);
        $upcoming = $this->schedule();
        $otherClass = GymClass::factory()->create(['default_instructor_id' => $this->instructor->id]);
        $otherSchedule = $this->schedule(['class_id' => $otherClass->id, 'start_time' => '12:00:00', 'end_time' => '13:00:00']);

        $this->travel(1)->minutes();
        $url = self::STATUS_URL.'?date_from=2026-10-15&updated_since='.urlencode(now()->toIso8601String());

        $this->class->update(['name' => 'Yoga Pagi Ceria']);
        $this->assertSame([], $this->ids($this->getJson($url)));

        $this->class->update(['min_participants' => 5]);
        $this->getJson($url)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $upcoming->id)
            ->assertJsonPath('data.0.min_participants', 5);

        $this->assertTrue($past->fresh()->updated_at->equalTo(CarbonImmutable::parse(self::NOW)));
        $this->assertTrue($otherSchedule->fresh()->updated_at->equalTo(CarbonImmutable::parse(self::NOW)));
    }

    /**
     * Kedua endpoint publik memakai rate limiter public-api (120 request/menit per IP), berbagi kuota.
     */
    public function test_public_schedule_endpoints_are_rate_limited(): void
    {
        RateLimiter::clear('public-api:127.0.0.1');

        for ($i = 0; $i < 60; $i++) {
            $this->getJson(self::URL)->assertOk();
            $this->getJson(self::STATUS_URL)->assertOk();
        }

        $this->getJson(self::STATUS_URL)->assertTooManyRequests();
        $this->getJson(self::URL)->assertTooManyRequests();
    }
}
