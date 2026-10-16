<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreInstructorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Nomor HP diseragamkan ke format 08xxx seperti registrasi member,
     * supaya admin boleh mengetik +62/62, spasi, atau tanda hubung.
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('phone_number'))) {
            $phone = preg_replace('/[\s\-().]/', '', $this->input('phone_number'));

            $this->merge([
                'phone_number' => preg_replace('/^(\+62|62)/', '0', $phone),
            ]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'specialization' => ['nullable', 'string', 'max:100'],
            'phone_number' => ['nullable', 'string', 'regex:/^08[0-9]{8,11}$/'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.required' => 'Nama instruktur wajib diisi.',
            'name.max' => 'Nama instruktur maksimal 100 karakter.',
            'specialization.max' => 'Spesialisasi maksimal 100 karakter.',
            'phone_number.regex' => 'Nomor HP harus nomor Indonesia yang diawali 08, +62, atau 62.',
        ];
    }
}
