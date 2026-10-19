<?php

namespace App\Http\Requests\Admin;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Query string daftar transaksi: filter status verifikasi dan paginasi.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'status' => ['nullable', Rule::in(['pending', 'verified', 'rejected'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'status.in' => 'Status harus salah satu dari: pending, verified, rejected.',
            'page.integer' => 'Nomor halaman harus berupa bilangan bulat.',
            'page.min' => 'Nomor halaman minimal 1.',
        ];
    }
}
