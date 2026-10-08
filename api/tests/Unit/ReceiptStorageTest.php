<?php

namespace Tests\Unit;

use App\Services\ReceiptStorage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

class ReceiptStorageTest extends TestCase
{
    private ReceiptStorage $service;

    private string $disk;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = new ReceiptStorage;
        $this->disk = $this->service->diskName();
        Storage::fake($this->disk);
    }

    public function test_store_saves_valid_file_with_uuid_and_year_month_folder(): void
    {
        $file = UploadedFile::fake()->image('bukti_transfer.jpg', 600, 800)->size(500);

        $path = $this->service->store($file);

        $year = now()->format('Y');
        $month = now()->format('m');

        $this->assertMatchesRegularExpression(
            "/^receipts\/{$year}\/{$month}\/[a-f0-9\-]+\.jpg$/",
            $path
        );
        $this->assertTrue($this->service->exists($path));
        Storage::disk($this->disk)->assertExists($path);
    }

    public function test_store_correctly_identifies_png_and_webp_from_content(): void
    {
        $png = UploadedFile::fake()->image('struk.png', 400, 400)->size(300);
        $pngPath = $this->service->store($png);
        $this->assertStringEndsWith('.png', $pngPath);
        $this->assertTrue($this->service->exists($pngPath));

        $webp = UploadedFile::fake()->image('struk.webp', 400, 400)->size(300);
        $webpPath = $this->service->store($webp);
        $this->assertStringEndsWith('.webp', $webpPath);
        $this->assertTrue($this->service->exists($webpPath));
    }

    public function test_store_throws_exception_on_fake_extension_content(): void
    {
        // Berkas teks disamarkan dengan nama berkas .jpg
        $fakeFile = UploadedFile::fake()->createWithContent('malicious.jpg', '<?php phpinfo(); ?>');

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Tipe konten file tidak diizinkan');

        $this->service->store($fakeFile);
    }

    public function test_store_throws_exception_when_file_exceeds_max_size(): void
    {
        // 2049 KB melebihi batas 2048 KB (2 MB)
        $largeFile = UploadedFile::fake()->image('struk_besar.jpg')->size(2049);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Ukuran file bukti transfer melebihi batas maksimum 2 MB.');

        $this->service->store($largeFile);
    }

    public function test_get_and_exists_and_delete_work_properly(): void
    {
        $file = UploadedFile::fake()->image('test.jpg');
        $path = $this->service->store($file);

        $this->assertTrue($this->service->exists($path));
        $this->assertNotNull($this->service->get($path));

        $deleted = $this->service->delete($path);
        $this->assertTrue($deleted);
        $this->assertFalse($this->service->exists($path));
        $this->assertNull($this->service->get($path));

        // Hapus path yang tidak ada mengembalikan false
        $this->assertFalse($this->service->delete('receipts/non_existent.jpg'));
    }

    public function test_response_returns_streamed_response_for_existing_file(): void
    {
        $file = UploadedFile::fake()->image('struk.png');
        $path = $this->service->store($file);

        $response = $this->service->response($path);
        $this->assertInstanceOf(StreamedResponse::class, $response);
        $this->assertStringContainsString('image/png', $response->headers->get('content-type', ''));
        $this->assertSame('nosniff', $response->headers->get('x-content-type-options'));
        $this->assertStringContainsString('private', $response->headers->get('cache-control', ''));
        $this->assertStringContainsString('no-store', $response->headers->get('cache-control', ''));
    }

    public function test_response_throws_404_for_non_existent_file(): void
    {
        $this->expectException(NotFoundHttpException::class);
        $this->expectExceptionMessage('Bukti transfer tidak ditemukan.');

        $this->service->response('receipts/2026/10/tidak-ada.jpg');
    }
}
