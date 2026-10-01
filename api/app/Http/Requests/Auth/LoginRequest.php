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
