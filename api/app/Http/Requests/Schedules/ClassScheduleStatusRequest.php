<?php

namespace App\Http\Requests\Schedules;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Polling status jadwal publik: rentang tanggal yang sama dengan daftar publik, ditambah updated_since.
 */
class ClassScheduleStatusRequest extends PublicClassScheduleRequest
{
    /**
     * ISO 8601 dengan offset (+08:00 atau Z), dengan atau tanpa pecahan detik.
     * date_format membandingkan ulang hasil format, sedangkan P menulis Z sebagai +00:00, jadi Z punya format sendiri.
     * Format ini hanya untuk validasi; nilainya dibaca updatedSince() lewat CarbonImmutable::parse (Z = UTC).
     */
    private const UPDATED_SINCE_FORMATS = [
        'Y-m-d\TH:i:sP', 'Y-m-d\TH:i:s.vP', 'Y-m-d\TH:i:s.uP',
        'Y-m-d\TH:i:s\Z', 'Y-m-d\TH:i:s.v\Z', 'Y-m-d\TH:i:s.u\Z',
    ];

    /**
     * Tanda "+" pada offset yang tidak di-encode klien terbaca sebagai spasi di query string; kembalikan menjadi "+".
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->query('updated_since'))) {
            $this->merge(['updated_since' => str_replace(' ', '+', $this->query('updated_since'))]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'updated_since' => ['sometimes', 'nullable', 'date_format:'.implode(',', self::UPDATED_SINCE_FORMATS)],
        ];
    }

    /**
     * Waktu updated_since dalam zona waktu aplikasi, karena updated_at disimpan dalam zona waktu itu.
     */
    public function updatedSince(): ?CarbonImmutable
    {
        if (! $this->filled('updated_since')) {
            return null;
        }

        return CarbonImmutable::parse($this->input('updated_since'))->setTimezone(config('app.timezone'));
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...parent::messages(),
            'updated_since.date_format' => 'updated_since harus berformat ISO 8601 dengan offset, mis. 2026-10-16T10:00:00+08:00.',
        ];
    }
}
