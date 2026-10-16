<?php

namespace App\Http\Requests\Admin;

use App\Models\ClassSchedule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexClassScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Query string daftar jadwal: rentang tanggal (inklusif), kelas, status, dan paginasi.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => [
                'sometimes',
                'bail',
                'date_format:Y-m-d',
                // Hanya dibandingkan bila date_from valid, agar date_from yang salah tidak ikut menandai date_to
                Rule::when($this->isValidDate($this->input('date_from')), 'after_or_equal:date_from'),
            ],
            'class_id' => ['sometimes', 'integer', 'min:1'],
            'status' => ['sometimes', Rule::in(ClassSchedule::STATUSES)],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    private function isValidDate(mixed $value): bool
    {
        return is_string($value) && validator(['d' => $value], ['d' => 'date_format:Y-m-d'])->passes();
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'date_from.date_format' => 'Tanggal awal harus berformat YYYY-MM-DD.',
            'date_to.date_format' => 'Tanggal akhir harus berformat YYYY-MM-DD.',
            'date_to.after_or_equal' => 'Tanggal akhir tidak boleh sebelum tanggal awal.',
            'status.in' => 'Status harus salah satu dari: '.implode(', ', ClassSchedule::STATUSES).'.',
        ];
    }
}
