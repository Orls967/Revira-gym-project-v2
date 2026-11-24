<?php

namespace App\Http\Requests\Admin;

use App\Services\Members\MemberListing;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexMemberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Query string daftar member: filter status terkini, paket, pencarian, dan paginasi.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'status' => ['sometimes', 'nullable', Rule::in(MemberListing::STATUSES)],
            'membership_plan_id' => ['sometimes', 'nullable', 'integer', 'exists:membership_plans,id'],
            'search' => ['sometimes', 'nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'status.in' => 'Status harus salah satu dari: active, pending, expired, none.',
            'membership_plan_id.integer' => 'ID paket harus berupa bilangan bulat.',
            'membership_plan_id.exists' => 'Paket membership tidak ditemukan.',
            'search.max' => 'Kata kunci pencarian maksimal 100 karakter.',
            'page.integer' => 'Nomor halaman harus berupa bilangan bulat.',
            'page.min' => 'Nomor halaman minimal 1.',
        ];
    }
}
