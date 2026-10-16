<?php

namespace App\Http\Requests\Admin;

use Carbon\CarbonImmutable;
use DateTime;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\Validator;

class StoreClassScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Tumpang tindih jadwal instruktur dicek di ClassScheduleService (di dalam transaksi), bukan di sini.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'class_id' => ['required', 'integer', $this->classRule()],
            'instructor_id' => ['required', 'integer', $this->instructorRule()],
            // Pembanding "today" memakai zona waktu aplikasi (WITA)
            'schedule_date' => ['bail', 'required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'start_time' => ['bail', 'required', 'date_format:H:i'],
            // bail: format salah cukup satu pesan. Jam selesai hanya dibandingkan bila jam mulai valid.
            'end_time' => [
                'bail',
                'required',
                'date_format:H:i',
                Rule::when($this->isValidTime($this->input('start_time')), 'after:start_time'),
            ],
        ];
    }

    /**
     * Jadwal baru hanya boleh untuk kelas aktif.
     */
    protected function classRule(): Exists
    {
        return Rule::exists('classes', 'id')->where('is_active', true);
    }

    /**
     * Jadwal baru hanya boleh memakai instruktur aktif.
     */
    protected function instructorRule(): Exists
    {
        return Rule::exists('instructors', 'id')->where('is_active', true);
    }

    /**
     * Sesi hari ini tidak boleh dibuat dengan jam mulai yang sudah lewat.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->hasAny(['schedule_date', 'start_time'])) {
                    return;
                }

                $startsAt = CarbonImmutable::parse($this->input('schedule_date').' '.$this->input('start_time'));

                if ($startsAt->isPast()) {
                    $validator->errors()->add('start_time', 'Jam mulai sudah lewat.');
                }
            },
        ];
    }

    private function isValidTime(mixed $value): bool
    {
        if (! is_string($value)) {
            return false;
        }

        $time = DateTime::createFromFormat('!H:i', $value);

        return $time !== false && $time->format('H:i') === $value;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'class_id.exists' => 'Kelas tidak ditemukan atau tidak aktif.',
            'instructor_id.exists' => 'Instruktur tidak ditemukan atau tidak aktif.',
            'schedule_date.date_format' => 'Tanggal jadwal harus berformat YYYY-MM-DD.',
            'schedule_date.after_or_equal' => 'Tanggal jadwal tidak boleh di masa lalu.',
            'start_time.date_format' => 'Jam mulai harus berformat HH:MM.',
            'end_time.date_format' => 'Jam selesai harus berformat HH:MM.',
            'end_time.after' => 'Jam selesai harus setelah jam mulai.',
        ];
    }
}
