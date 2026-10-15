<?php

namespace App\Http\Requests\Admin;

use App\Models\OperationalHour;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreOperationalHourRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Bila is_closed true, open_time dan close_time diabaikan (tidak divalidasi, disimpan null).
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $isClosed = fn () => $this->boolean('is_closed');

        return [
            'day_of_week' => [
                'required',
                'string',
                Rule::in(OperationalHour::DAYS),
                // Satu baris per hari; saat ubah, baris itu sendiri dikecualikan
                Rule::unique('operational_hours', 'day_of_week')->ignore($this->route('operationalHour')),
            ],
            'is_closed' => ['required', 'boolean'],
            'open_time' => [Rule::excludeIf($isClosed), 'required', 'date_format:H:i'],
            'close_time' => [Rule::excludeIf($isClosed), 'required', 'date_format:H:i', 'after:open_time'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'day_of_week.unique' => 'Jam operasional untuk hari ini sudah ada.',
            'day_of_week.in' => 'Hari harus salah satu dari: '.implode(', ', OperationalHour::DAYS).'.',
            'open_time.required' => 'Jam buka wajib diisi bila hari tidak libur.',
            'close_time.required' => 'Jam tutup wajib diisi bila hari tidak libur.',
            'open_time.date_format' => 'Jam buka harus berformat HH:MM.',
            'close_time.date_format' => 'Jam tutup harus berformat HH:MM.',
            'close_time.after' => 'Jam tutup harus setelah jam buka.',
        ];
    }

    /**
     * Data siap simpan: jam dikosongkan bila libur.
     *
     * @return array<string, mixed>
     */
    public function operationalHourData(): array
    {
        $data = $this->validated();

        if ($data['is_closed']) {
            $data['open_time'] = null;
            $data['close_time'] = null;
        }

        return $data;
    }
}
