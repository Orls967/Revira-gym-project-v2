<?php

namespace App\Http\Requests\Auth;

use App\Services\Auth\ApiTokenService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Validasi body POST /api/v1/register (registrasi akun member dari aplikasi mobile).
 */
class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Menyeragamkan email (huruf kecil) dan nomor HP (format 08xxx) sebelum divalidasi,
     * supaya cek unique email konsisten dan nomor WA tersimpan dalam satu format.
     */
    protected function prepareForValidation(): void
    {
        $data = [];

        if (is_string($this->input('email'))) {
            $data['email'] = mb_strtolower(trim($this->input('email')));
        }

        if (is_string($this->input('phone_number'))) {
            $phone = preg_replace('/[\s\-().]/', '', $this->input('phone_number'));
            $data['phone_number'] = preg_replace('/^(\+62|62)/', '0', $phone);
        }

        $this->merge($data);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'string', 'email', 'max:150', Rule::unique('users', 'email')],
            'phone_number' => ['required', 'string', 'regex:/^08[0-9]{8,11}$/'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
            // Registrasi hanya dari aplikasi mobile; admin dibuat lewat seeder/tinker
            'device_name' => ['required', 'string', Rule::in([ApiTokenService::DEVICE_MOBILE])],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'phone_number.regex' => 'Nomor HP harus nomor Indonesia yang diawali 08, +62, atau 62.',
        ];
    }
}
