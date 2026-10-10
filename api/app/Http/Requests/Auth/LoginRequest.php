<?php

namespace App\Http\Requests\Auth;

use App\Services\Auth\ApiTokenService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validasi body POST /api/v1/login.
 */
class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Menyeragamkan email (huruf kecil) seperti saat registrasi, supaya pencarian user
     * tidak bergantung pada collation database (SQLite membedakan huruf besar/kecil).
     */
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
            'device_name' => ['required', 'string', Rule::in([
                ApiTokenService::DEVICE_MOBILE,
                ApiTokenService::DEVICE_ADMIN_WEB,
            ])],
        ];
    }
}
