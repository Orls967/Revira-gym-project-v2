<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class RejectTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Memastikan string kosong atau hanya spasi dinormalisasi menjadi null sebelum divalidasi.
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->reject_reason)) {
            $trimmed = trim($this->reject_reason);
            $this->merge([
                'reject_reason' => $trimmed === '' ? null : $trimmed,
            ]);
        }
    }

    /**
     * Aturan validasi penolakan transaksi.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'reject_reason' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reject_reason.required' => 'Alasan penolakan wajib diisi.',
            'reject_reason.max' => 'Alasan penolakan maksimal 255 karakter.',
        ];
    }
}
