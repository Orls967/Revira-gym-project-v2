<?php

namespace App\Http\Requests\Member;

use App\Services\ReceiptStorage;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreMembershipApplicationRequest extends FormRequest
{
    /**
     * Otorisasi sudah ditangani middleware role:member.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'membership_plan_id' => [
                'required',
                'integer',
                'exists:membership_plans,id,is_active,1',
            ],
            'start_date' => [
                'required',
                'date_format:Y-m-d',
                'after_or_equal:today',
            ],
            'payment_method' => [
                'required',
                'in:transfer,on_the_spot',
            ],
        ];

        // M2: prohibited hanya berlaku bila payment_method === 'on_the_spot'.
        // Bila payment_method tidak valid/kosong, tidak ada error menyesatkan pada receipt_image.
        if ($this->input('payment_method') === 'transfer') {
            $rules['receipt_image'] = ReceiptStorage::rules();
        } elseif ($this->input('payment_method') === 'on_the_spot') {
            $rules['receipt_image'] = ['prohibited'];
        }

        return $rules;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'membership_plan_id.required' => 'Paket membership wajib dipilih.',
            'membership_plan_id.integer' => 'Paket membership harus berupa ID yang valid.',
            'membership_plan_id.exists' => 'Paket tidak ditemukan atau tidak aktif.',

            'start_date.required' => 'Tanggal mulai wajib diisi.',
            'start_date.date_format' => 'Format tanggal mulai harus YYYY-MM-DD.',
            'start_date.after_or_equal' => 'Tanggal mulai minimal hari ini.',

            'payment_method.required' => 'Metode pembayaran wajib dipilih.',
            'payment_method.in' => 'Metode pembayaran harus transfer atau on_the_spot.',

            'receipt_image.required' => 'Bukti transfer wajib diunggah untuk pembayaran transfer.',
            'receipt_image.file' => 'Bukti transfer harus berupa file.',
            'receipt_image.mimetypes' => 'Format bukti transfer harus JPG, PNG, atau WEBP.',
            'receipt_image.max' => 'Ukuran file bukti transfer maksimal 2 MB.',
            'receipt_image.prohibited' => 'Bukti transfer tidak diperlukan untuk pembayaran di tempat.',
        ];
    }
}
