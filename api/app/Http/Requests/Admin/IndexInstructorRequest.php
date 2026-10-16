<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class IndexInstructorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Query string daftar instruktur: filter is_active, cari nama, dan paginasi.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Query string selalu berupa teks, jadi "true"/"false" juga diterima
            'is_active' => ['sometimes', 'in:0,1,true,false'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'is_active.in' => 'Filter is_active harus bernilai true, false, 1, atau 0.',
        ];
    }

    /**
     * Nilai filter is_active, atau null bila tidak dikirim.
     */
    public function isActiveFilter(): ?bool
    {
        return $this->has('is_active') ? $this->boolean('is_active') : null;
    }
}
