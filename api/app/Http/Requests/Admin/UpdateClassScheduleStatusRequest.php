<?php

namespace App\Http\Requests\Admin;

use App\Models\ClassSchedule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateClassScheduleStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Aturan transisi antarstatus dicek di ClassScheduleService; di sini hanya bentuk input.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in(ClassSchedule::STATUSES)],
            'cancel_reason' => [
                'nullable',
                Rule::requiredIf($this->input('status') === ClassSchedule::STATUS_CANCELLED),
                'string',
                'max:255',
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'status.required' => 'Status wajib diisi.',
            'status.in' => 'Status harus salah satu dari: '.implode(', ', ClassSchedule::STATUSES).'.',
            'cancel_reason.required' => 'Alasan pembatalan wajib diisi bila jadwal dibatalkan.',
            'cancel_reason.max' => 'Alasan pembatalan maksimal 255 karakter.',
        ];
    }
}
