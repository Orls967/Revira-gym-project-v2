<?php

namespace App\Http\Requests\Admin;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class UpdateGymClassRequest extends StoreGymClassRequest
{
    /**
     * Instruktur yang sudah terpasang boleh dipertahankan walau kini nonaktif,
     * agar kelas tetap bisa diubah (mis. ganti nama). Mengganti instruktur tetap wajib ke yang aktif.
     */
    protected function instructorRule(): Exists
    {
        $current = $this->route('gymClass')?->default_instructor_id;

        if ($current !== null && (string) $this->input('default_instructor_id') === (string) $current) {
            return Rule::exists('instructors', 'id');
        }

        return parent::instructorRule();
    }
}
