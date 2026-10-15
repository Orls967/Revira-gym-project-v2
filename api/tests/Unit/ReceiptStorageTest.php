<?php

namespace Tests\Unit;

use App\Services\ReceiptStorage;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use League\Flysystem\UnableToWriteFile;
use Mockery;
use RuntimeException;
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

    public function test_store_throws_validation_exception_on_fake_extension_content(): void
    {
        // Berkas teks disamarkan dengan nama berkas .jpg
        $fakeFile = UploadedFile::fake()->createWithContent('malicious.jpg', '<?php phpinfo(); ?>');

        try {
            $this->service->store($fakeFile);
            $this->fail('ValidationException seharusnya dilempar.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('receipt_image', $e->errors());
            $this->assertStringContainsString('Format file tidak didukung', $e->errors()['receipt_image'][0]);
        }
    }

    public function test_store_throws_validation_exception_when_file_exceeds_max_size(): void
    {
        // 2049 KB melebihi batas 2048 KB (2 MB)
        $largeFile = UploadedFile::fake()->image('struk_besar.jpg')->size(2049);

        try {
            $this->service->store($largeFile);
            $this->fail('ValidationException seharusnya dilempar.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('receipt_image', $e->errors());
            $this->assertSame(
                'Ukuran file bukti transfer melebihi batas maksimum 2 MB.',
                $e->errors()['receipt_image'][0]
            );
        }
    }

    public function test_rules_reject_php_file_named_jpg(): void
    {
        // UploadedFile::fake() menebak MIME dari ekstensi, jadi pakai berkas asli dengan isi PHP
        $path = tempnam(sys_get_temp_dir(), 'receipt');
        file_put_contents($path, '<?php phpinfo(); ?>');
        $fake = new UploadedFile($path, 'malicious.jpg', null, null, true);

        $validator = Validator::make(['receipt_image' => $fake], ['receipt_image' => ReceiptStorage::rules()]);

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('receipt_image', $validator->errors()->toArray());

        @unlink($path);
    }

    public function test_rules_accept_real_jpg_png_and_webp(): void
    {
        foreach (['struk.jpg', 'struk.png', 'struk.webp'] as $name) {
            $generated = UploadedFile::fake()->image($name, 300, 300)->size(100);
            // Bungkus ulang agar MIME dideteksi dari isi berkas (bukan tebakan ekstensi milik fake)
            $file = new UploadedFile($generated->getPathname(), $name, null, null, true);

            $validator = Validator::make(['receipt_image' => $file], ['receipt_image' => ReceiptStorage::rules()]);

            $this->assertTrue($validator->passes(), "{$name} seharusnya diterima");
        }
    }

    public function test_store_throws_runtime_exception_when_disk_returns_false(): void
    {
        $disk = Mockery::mock(Filesystem::class);
        $disk->shouldReceive('putFileAs')->once()->andReturn(false);
        Storage::shouldReceive('disk')->with($this->disk)->andReturn($disk);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Gagal menyimpan bukti transfer');

        $this->service->store(UploadedFile::fake()->image('struk.jpg'));
    }

    public function test_store_throws_runtime_exception_when_disk_throws_unable_to_write(): void
    {
        $disk = Mockery::mock(Filesystem::class);
        $disk->shouldReceive('putFileAs')->once()->andThrow(UnableToWriteFile::atLocation('receipts/x.jpg', 'permission denied'));
        Storage::shouldReceive('disk')->with($this->disk)->andReturn($disk);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Gagal menyimpan bukti transfer');

        $this->service->store(UploadedFile::fake()->image('struk.jpg'));
    }

    public function test_receipts_disk_is_configured_to_throw_on_failure(): void
    {
        $config = config('filesystems.disks.receipts');

        $this->assertSame('local', $config['driver']);
        $this->assertTrue($config['throw']);
        $this->assertSame('private', $config['visibility']);
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

    public function test_store_throws_validation_exception_when_file_is_zero_bytes(): void
    {
        $temp = tempnam(sys_get_temp_dir(), 'zero');
        file_put_contents($temp, '');
        $zeroFile = new UploadedFile($temp, 'kosong.jpg', null, null, true);

        try {
            $this->service->store($zeroFile);
            $this->fail('ValidationException seharusnya dilempar.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('receipt_image', $e->errors());
            $this->assertSame(
                'Format file tidak didukung. Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.',
                $e->errors()['receipt_image'][0]
            );
        } finally {
            @unlink($temp);
        }
    }

    public function test_invalid_paths_and_path_traversal_are_safely_rejected(): void
    {
        $maliciousPaths = [
            '../.env',
            '/etc/passwd',
            'lain.txt',
            'receipts/../.env',
        ];

        foreach ($maliciousPaths as $path) {
            $this->assertFalse($this->service->exists($path), "exists({$path}) harus false");
            $this->assertFalse($this->service->delete($path), "delete({$path}) harus false");

            try {
                $this->service->get($path);
                $this->fail("get({$path}) harus melempar InvalidArgumentException");
            } catch (\InvalidArgumentException $e) {
                $this->assertSame('Path bukti transfer tidak valid.', $e->getMessage());
            }

            try {
                $this->service->response($path);
                $this->fail("response({$path}) harus melempar NotFoundHttpException (404)");
            } catch (NotFoundHttpException $e) {
                $this->assertSame('Bukti transfer tidak ditemukan.', $e->getMessage());
            }
        }
    }

    public function test_valid_upload_and_seeder_paths_remain_accessible(): void
    {
        // 1. Path seeder dummy
        $seederPath = 'receipts/transfer_1.jpg';
        Storage::disk($this->disk)->put($seederPath, 'dummy seeder content');

        $this->assertTrue($this->service->exists($seederPath));
        $this->assertSame('dummy seeder content', $this->service->get($seederPath));
        $this->assertInstanceOf(StreamedResponse::class, $this->service->response($seederPath));

        // 2. Path upload asli
        $file = UploadedFile::fake()->image('bukti.jpg');
        $uploadPath = $this->service->store($file);

        $this->assertTrue($this->service->exists($uploadPath));
        $this->assertNotNull($this->service->get($uploadPath));
        $this->assertInstanceOf(StreamedResponse::class, $this->service->response($uploadPath));
    }
}
