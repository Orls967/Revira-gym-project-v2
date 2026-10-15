<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

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
            'min_participants' => ['required', 'integer', 'min:1'],
            'default_instructor_id' => ['nullable', 'integer', 'exists:instructors,id'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'min_participants.min' => 'Jumlah peserta minimum harus minimal 1.',
            'default_instructor_id.exists' => 'Instruktur tidak ditemukan.',
        ];
    }
}
