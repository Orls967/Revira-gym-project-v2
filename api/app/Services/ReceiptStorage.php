<?php

namespace App\Services;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Service untuk mengelola penyimpanan bukti transfer pembayaran secara aman dan persisten.
 *
 * Menggunakan disk privat (default 'receipts') yang terisolasi dari akses publik.
 * Memvalidasi konten berkas (magic bytes / MIME type asli) bukan sekadar ekstensi,
 * membatasi ukuran maksimal 2 MB, menamai file secara acak (UUID), dan mengelompokkan
 * ke dalam folder receipts/{tahun}/{bulan}.
 */
class ReceiptStorage
{
    /**
     * MIME types yang diizinkan berdasarkan inspeksi konten asli file.
     *
     * @var array<int, string>
     */
    public const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    /**
     * Ukuran maksimal file dalam kilobyte (2 MB).
     */
    public const MAX_FILE_SIZE_KB = 2048;

    /**
     * Ukuran maksimal file dalam bytes (2.097.152 bytes).
     */
    public const MAX_FILE_SIZE_BYTES = 2048 * 1024;

    /**
     * Mendapatkan nama disk yang dikonfigurasi untuk bukti transfer.
     */
    public function diskName(): string
    {
        return (string) config('filesystems.receipts_disk', 'receipts');
    }

    /**
     * Mendapatkan instance filesystem disk untuk bukti transfer.
     */
    public function disk(): Filesystem
    {
        return Storage::disk($this->diskName());
    }

    /**
     * Mendeteksi MIME type asli berdasarkan isi berkas (magic bytes).
     */
    public function detectMimeType(UploadedFile $file): string
    {
        $realPath = $file->getRealPath();
        if ($realPath && file_exists($realPath)) {
            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mime = $finfo->file($realPath);
            if ($mime) {
                return $mime;
            }
        }

        return $file->getMimeType();
    }

    /**
     * Validasi konten file dan ukurannya sebelum disimpan.
     *
     * @throws InvalidArgumentException
     */
    public function validate(UploadedFile $file): void
    {
        if (! $file->isValid()) {
            throw new InvalidArgumentException('File bukti transfer yang diunggah tidak valid.');
        }

        $mime = $this->detectMimeType($file);
        if (! in_array($mime, self::ALLOWED_MIME_TYPES, true)) {
            throw new InvalidArgumentException("Tipe konten file tidak diizinkan ({$mime}). Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.");
        }

        if ($file->getSize() > self::MAX_FILE_SIZE_BYTES) {
            throw new InvalidArgumentException('Ukuran file bukti transfer melebihi batas maksimum 2 MB.');
        }
    }

    /**
     * Menyimpan file bukti transfer ke storage privat.
     * Mengembalikan path relatif di dalam disk (contoh: receipts/2026/10/{uuid}.jpg).
     *
     * @throws InvalidArgumentException
     */
    public function store(UploadedFile $file): string
    {
        $this->validate($file);

        $mime = $this->detectMimeType($file);
        $extension = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };

        $year = now()->format('Y');
        $month = now()->format('m');
        $directory = "receipts/{$year}/{$month}";
        $filename = sprintf('%s.%s', Str::uuid()->toString(), $extension);

        $storedPath = $this->disk()->putFileAs($directory, $file, $filename);

        return $storedPath ?: "{$directory}/{$filename}";
    }

    /**
     * Menyimpan konten mentah (raw bytes) sebagai file bukti transfer (mis. untuk seeder / testing).
     */
    public function storeRaw(string $contents, string $extension = 'jpg'): string
    {
        $year = now()->format('Y');
        $month = now()->format('m');
        $directory = "receipts/{$year}/{$month}";
        $filename = sprintf('%s.%s', Str::uuid()->toString(), $extension);
        $path = "{$directory}/{$filename}";

        $this->disk()->put($path, $contents);

        return $path;
    }

    /**
     * Memeriksa keberadaan file di disk bukti transfer.
     */
    public function exists(?string $path): bool
    {
        if (empty($path)) {
            return false;
        }

        return $this->disk()->exists($path);
    }

    /**
     * Mengambil konten biner file bukti transfer.
     */
    public function get(string $path): ?string
    {
        if (! $this->exists($path)) {
            return null;
        }

        return $this->disk()->get($path);
    }

    /**
     * Menghapus file bukti transfer dari disk.
     */
    public function delete(?string $path): bool
    {
        if (empty($path) || ! $this->exists($path)) {
            return false;
        }

        return $this->disk()->delete($path);
    }

    /**
     * Menghasilkan StreamedResponse untuk menyajikan file bukti transfer secara terautentikasi.
     *
     * @param  array<string, mixed>  $headers
     *
     * @throws NotFoundHttpException
     */
    public function response(string $path, ?string $name = null, array $headers = []): StreamedResponse
    {
        if (! $this->exists($path)) {
            throw new NotFoundHttpException('Bukti transfer tidak ditemukan.');
        }

        $mime = $this->disk()->mimeType($path) ?: 'application/octet-stream';
        $defaultHeaders = [
            'Content-Type' => $mime,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ];

        return $this->disk()->response($path, $name, array_merge($defaultHeaders, $headers));
    }
}
