<?php

namespace App\Services;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use League\Flysystem\PathTraversalDetected;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

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
     * Aturan validasi untuk dipakai FormRequest (mis. SCRUM-69) pada field receipt_image.
     * Validasi isi file di service ini tetap dijalankan sebagai lapis kedua.
     *
     * @return array<int, string>
     */
    public static function rules(): array
    {
        return [
            'required',
            'file',
            'mimetypes:'.implode(',', self::ALLOWED_MIME_TYPES),
            'max:'.self::MAX_FILE_SIZE_KB,
        ];
    }

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
     * Memvalidasi format path bukti transfer untuk mencegah path traversal dan akses luar boundary.
     * Harus string non-kosong, diawali "receipts/", tidak mengandung "..", tidak diawali "/",
     * dan hanya berisi karakter [A-Za-z0-9/_.-].
     */
    private function isValidPath(?string $path): bool
    {
        if (empty($path)) {
            return false;
        }

        if (! str_starts_with($path, 'receipts/')) {
            return false;
        }

        if (str_starts_with($path, '/') || str_contains($path, '..')) {
            return false;
        }

        return (bool) preg_match('/^[A-Za-z0-9\/_.\-]+$/', $path);
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
     * @throws ValidationException
     */
    public function validate(UploadedFile $file): void
    {
        if (! $file->isValid()) {
            throw ValidationException::withMessages([
                'receipt_image' => ['File bukti transfer yang diunggah tidak valid.'],
            ]);
        }

        if ($file->getSize() > self::MAX_FILE_SIZE_BYTES) {
            throw ValidationException::withMessages([
                'receipt_image' => ['Ukuran file bukti transfer melebihi batas maksimum 2 MB.'],
            ]);
        }

        if ($file->getSize() <= 0) {
            throw ValidationException::withMessages([
                'receipt_image' => ['Format file tidak didukung. Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.'],
            ]);
        }

        $mime = $this->detectMimeType($file);
        if (! in_array($mime, self::ALLOWED_MIME_TYPES, true)) {
            throw ValidationException::withMessages([
                'receipt_image' => ['Format file tidak didukung. Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.'],
            ]);
        }
    }

    /**
     * Menyimpan file bukti transfer ke storage privat.
     * Mengembalikan path relatif di dalam disk (contoh: receipts/2026/10/{uuid}.jpg).
     *
     * @throws ValidationException bila file tidak lolos validasi isi/ukuran
     * @throws RuntimeException bila penulisan ke disk gagal
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

        try {
            $storedPath = $this->disk()->putFileAs($directory, $file, $filename);
        } catch (Throwable $e) {
            throw new RuntimeException('Gagal menyimpan bukti transfer', 0, $e);
        }

        if (! is_string($storedPath) || $storedPath === '') {
            throw new RuntimeException('Gagal menyimpan bukti transfer');
        }

        return $storedPath;
    }

    /**
     * Memeriksa keberadaan file di disk bukti transfer.
     */
    public function exists(?string $path): bool
    {
        if (! $this->isValidPath($path)) {
            return false;
        }

        try {
            return $this->disk()->exists($path);
        } catch (PathTraversalDetected) {
            return false;
        }
    }

    /**
     * Mengambil konten biner file bukti transfer.
     *
     * @throws InvalidArgumentException bila path tidak valid
     */
    public function get(string $path): ?string
    {
        if (! $this->isValidPath($path)) {
            throw new InvalidArgumentException('Path bukti transfer tidak valid.');
        }

        if (! $this->exists($path)) {
            return null;
        }

        try {
            return $this->disk()->get($path);
        } catch (PathTraversalDetected) {
            throw new InvalidArgumentException('Path bukti transfer tidak valid.');
        }
    }

    /**
     * Menghapus file bukti transfer dari disk.
     */
    public function delete(?string $path): bool
    {
        if (! $this->isValidPath($path) || ! $this->exists($path)) {
            return false;
        }

        try {
            return $this->disk()->delete($path);
        } catch (PathTraversalDetected) {
            return false;
        }
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
        if (! $this->isValidPath($path) || ! $this->exists($path)) {
            throw new NotFoundHttpException('Bukti transfer tidak ditemukan.');
        }

        try {
            $mime = $this->disk()->mimeType($path) ?: 'application/octet-stream';
            $defaultHeaders = [
                'Content-Type' => $mime,
                'X-Content-Type-Options' => 'nosniff',
                'Cache-Control' => 'private, no-store',
            ];

            return $this->disk()->response($path, $name, array_merge($defaultHeaders, $headers));
        } catch (PathTraversalDetected) {
            throw new NotFoundHttpException('Bukti transfer tidak ditemukan.');
        }
    }
}
