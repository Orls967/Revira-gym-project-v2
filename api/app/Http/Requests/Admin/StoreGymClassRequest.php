<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class StoreGymClassRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Kelas hanya punya batas minimum peserta; tidak ada field kapasitas maksimum.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:1000'],
            // Batas atas mencegah nilai di luar rentang kolom integer lolos lalu ditolak database (500)
            'min_participants' => ['required', 'integer', 'min:1', 'max:1000'],
            'default_instructor_id' => ['nullable', 'integer', $this->instructorRule()],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Kelas baru hanya boleh memakai instruktur aktif.
     */
    protected function instructorRule(): Exists
    {
        return Rule::exists('instructors', 'id')->where('is_active', true);
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'min_participants.min' => 'Jumlah peserta minimum harus minimal 1.',
            'min_participants.max' => 'Jumlah peserta minimum tidak boleh lebih dari 1000.',
            'default_instructor_id.exists' => 'Instruktur tidak ditemukan atau tidak aktif.',
        ];
    }
}
