<?php

namespace App\Http\Requests\Schedules;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Rentang tanggal jadwal publik (daftar dan polling status).
 *
 * Default 7 hari: tanpa keduanya (atau kosong) hari ini s.d. 6 hari ke depan; bila hanya satu sisi dikirim,
 * sisi lain dihitung 7 hari dari sisi itu. Rentang dibatasi MAX_RANGE_DAYS hari (inklusif) agar query tetap ringan.
 */
class PublicClassScheduleRequest extends FormRequest
{
    public const DEFAULT_RANGE_DAYS = 7;

    public const MAX_RANGE_DAYS = 31;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'date_from' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }

    /**
     * Cek urutan dan panjang rentang setelah format tanggal dipastikan valid.
     *
     * @return array<int, \Closure>
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->hasAny(['date_from', 'date_to'])) {
                    return;
                }

                $from = $this->dateFrom();
                $to = $this->dateTo();

                if ($to->lt($from)) {
                    $validator->errors()->add('date_to', 'Tanggal akhir tidak boleh sebelum tanggal awal.');
                } elseif ($from->diffInDays($to) >= self::MAX_RANGE_DAYS) {
                    $validator->errors()->add('date_to', 'Rentang tanggal maksimal '.self::MAX_RANGE_DAYS.' hari.');
                }
            },
        ];
    }

    public function dateFrom(): CarbonImmutable
    {
        if ($this->filled('date_from')) {
            return CarbonImmutable::createFromFormat('!Y-m-d', $this->input('date_from'));
        }

        return $this->filled('date_to')
            ? CarbonImmutable::createFromFormat('!Y-m-d', $this->input('date_to'))->subDays(self::DEFAULT_RANGE_DAYS - 1)
            : CarbonImmutable::today();
    }

    public function dateTo(): CarbonImmutable
    {
        return $this->filled('date_to')
            ? CarbonImmutable::createFromFormat('!Y-m-d', $this->input('date_to'))
            : $this->dateFrom()->addDays(self::DEFAULT_RANGE_DAYS - 1);
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'date_from.date_format' => 'Tanggal awal harus berformat YYYY-MM-DD.',
            'date_to.date_format' => 'Tanggal akhir harus berformat YYYY-MM-DD.',
        ];
    }
}
