<?php

namespace Tests\Unit;

use App\Contracts\WhatsAppSender;
use App\Services\WhatsApp\FonnteWhatsAppSender;
use App\Services\WhatsApp\LogWhatsAppSender;
use App\Services\WhatsApp\PhoneNumber;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class WhatsAppSenderTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    private function fonnte(?string $token = 'token-uji'): FonnteWhatsAppSender
    {
        return new FonnteWhatsAppSender($token, 10);
    }

    /**
     * Pengiriman berhasil: token dikirim di header Authorization tanpa "Bearer", nomor sudah dinormalisasi.
     */
    public function test_fonnte_send_successfully(): void
    {
        Http::fake([
            FonnteWhatsAppSender::ENDPOINT => Http::response([
                'detail' => 'success! message in queue',
                'id' => ['80367170'],
                'process' => 'pending',
                'status' => true,
                'target' => ['6281234567890'],
            ]),
        ]);

        $result = $this->fonnte()->send('0812-3456-7890', 'Halo dari Revira Gym');

        $this->assertTrue($result->successful);
        $this->assertNull($result->error);
        $this->assertSame('80367170', $result->messageId);

        Http::assertSent(function (Request $request) {
            return $request->url() === FonnteWhatsAppSender::ENDPOINT
                && $request->method() === 'POST'
                && $request->header('Authorization') === ['token-uji']
                && $request['target'] === '6281234567890'
                && $request['message'] === 'Halo dari Revira Gym';
        });
    }

    /**
     * Gateway membalas status false (HTTP 200): hasil gagal dengan alasan dari gateway.
     */
    public function test_fonnte_rejection_returns_failed_result(): void
    {
        Http::fake([
            FonnteWhatsAppSender::ENDPOINT => Http::response(['reason' => 'target invalid', 'status' => false]),
        ]);

        $result = $this->fonnte()->send('081234567890', 'Halo');

        $this->assertTrue($result->failed());
        $this->assertStringContainsString('target invalid', $result->error);
    }

    /**
     * Respons token tidak valid (kunci "Status" huruf besar) tetap dibaca sebagai gagal karena "status" tidak bernilai true.
     */
    public function test_fonnte_invalid_token_returns_failed_result(): void
    {
        Http::fake([
            FonnteWhatsAppSender::ENDPOINT => Http::response(['Status' => false, 'reason' => 'token invalid']),
        ]);

        $result = $this->fonnte()->send('081234567890', 'Halo');

        $this->assertTrue($result->failed());
        $this->assertStringContainsString('token invalid', $result->error);
    }

    /**
     * HTTP error tanpa body JSON (mis. 502 dari proxy) menjadi hasil gagal dengan kode HTTP.
     */
    public function test_fonnte_http_error_returns_failed_result(): void
    {
        Http::fake([
            FonnteWhatsAppSender::ENDPOINT => Http::response('<html>Bad Gateway</html>', 502),
        ]);

        $result = $this->fonnte()->send('081234567890', 'Halo');

        $this->assertTrue($result->failed());
        $this->assertStringContainsString('HTTP 502', $result->error);
    }

    /**
     * Timeout atau error jaringan dikembalikan sebagai hasil gagal, tidak melempar exception.
     */
    public function test_fonnte_timeout_returns_failed_result(): void
    {
        Http::fake(function () {
            throw new ConnectionException('cURL error 28: Operation timed out after 10000 milliseconds');
        });

        $result = $this->fonnte()->send('081234567890', 'Halo');

        $this->assertTrue($result->failed());
        $this->assertStringContainsString('Gagal terhubung', $result->error);
    }

    /**
     * Nomor kosong atau tidak valid langsung gagal tanpa memanggil gateway.
     */
    public function test_fonnte_invalid_phone_does_not_call_gateway(): void
    {
        Http::fake();

        $this->assertTrue($this->fonnte()->send('', 'Halo')->failed());
        $this->assertTrue($this->fonnte()->send('12345', 'Halo')->failed());

        Http::assertNothingSent();
    }

    /**
     * Token kosong (env belum diisi) langsung gagal tanpa memanggil gateway.
     */
    public function test_fonnte_without_token_does_not_call_gateway(): void
    {
        Http::fake();

        $result = $this->fonnte(null)->send('081234567890', 'Halo');

        $this->assertTrue($result->failed());
        $this->assertStringContainsString('Token', $result->error);
        Http::assertNothingSent();
    }

    /**
     * Driver log menulis pesan ke log dengan nomor disamarkan (di luar lokal) dan tidak memanggil HTTP sama sekali.
     */
    public function test_log_driver_writes_masked_log_without_http(): void
    {
        Http::fake();
        Log::spy();

        $result = (new LogWhatsAppSender)->send('+62 812 3456 7890', 'Halo');

        $this->assertTrue($result->successful);
        $this->assertNull($result->messageId);
        Http::assertNothingSent();
        Log::shouldHaveReceived('info')->once()->withArgs(
            fn (string $message, array $context) => $context === ['phone' => '62812*****890', 'message' => 'Halo']
        );
    }

    /**
     * Di lingkungan lokal nomor ditulis lengkap agar mudah dicek developer.
     */
    public function test_log_driver_writes_full_phone_in_local(): void
    {
        $this->app['env'] = 'local';
        Log::spy();

        (new LogWhatsAppSender)->send('081234567890', 'Halo');

        Log::shouldHaveReceived('info')->once()->withArgs(
            fn (string $message, array $context) => $context['phone'] === '6281234567890'
        );
    }

    /**
     * Driver log tetap menolak nomor tidak valid agar perilakunya sama dengan driver gateway.
     */
    public function test_log_driver_rejects_invalid_phone(): void
    {
        $this->assertTrue((new LogWhatsAppSender)->send('abc', 'Halo')->failed());
    }

    /**
     * @return array<string, array{0: ?string, 1: ?string}>
     */
    public static function phoneNumbers(): array
    {
        return [
            '08xx' => ['081234567890', '6281234567890'],
            '+62xx' => ['+6281234567890', '6281234567890'],
            '62xx' => ['6281234567890', '6281234567890'],
            'dengan spasi dan tanda hubung' => ['0812 3456-7890', '6281234567890'],
            'kosong' => ['', null],
            'null' => [null, null],
            'terlalu pendek' => ['08123', null],
            'terlalu panjang' => ['081234567890123', null],
            'mengandung huruf' => ['0812abc7890', null],
            'bukan nomor seluler' => ['0511334455', null],
            'kode negara lain' => ['+60123456789', null],
        ];
    }

    /**
     * Normalisasi nomor: 08xx / +62xx menjadi 62xx, selain itu null.
     */
    #[DataProvider('phoneNumbers')]
    public function test_phone_number_normalization(?string $input, ?string $expected): void
    {
        $this->assertSame($expected, PhoneNumber::normalize($input));
    }

    /**
     * Binding container mengikuti WHATSAPP_DRIVER; driver tidak dikenal ditolak.
     */
    public function test_container_binding_follows_configured_driver(): void
    {
        config(['services.whatsapp.driver' => 'log']);
        $this->assertInstanceOf(LogWhatsAppSender::class, $this->app->make(WhatsAppSender::class));

        $this->app->forgetInstance(WhatsAppSender::class);
        config(['services.whatsapp.driver' => 'fonnte', 'services.whatsapp.token' => 'x']);
        $this->assertInstanceOf(FonnteWhatsAppSender::class, $this->app->make(WhatsAppSender::class));

        $this->app->forgetInstance(WhatsAppSender::class);
        config(['services.whatsapp.driver' => 'wa-palsu']);
        $this->expectException(InvalidArgumentException::class);
        $this->app->make(WhatsAppSender::class);
    }
}
