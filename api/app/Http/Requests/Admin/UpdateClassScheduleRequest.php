<?php

namespace App\Http\Requests\Admin;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class UpdateClassScheduleRequest extends StoreClassScheduleRequest
{
    /**
     * Kelas yang sudah terpasang boleh dipertahankan walau kini nonaktif, agar jadwal tetap bisa diubah
     * (mis. digeser jamnya). Mengganti ke kelas lain tetap wajib yang aktif.
     */
    protected function classRule(): Exists
    {
        return $this->keepsCurrent('class_id')
            ? Rule::exists('classes', 'id')
            : parent::classRule();
    }

    /**
     * Sama seperti kelas: instruktur yang sudah terpasang boleh dipertahankan walau nonaktif.
     */
    protected function instructorRule(): Exists
    {
        return $this->keepsCurrent('instructor_id')
            ? Rule::exists('instructors', 'id')
            : parent::instructorRule();
    }

    private function keepsCurrent(string $field): bool
    {
        $current = $this->route('classSchedule')?->{$field};

        return $current !== null && (string) $this->input($field) === (string) $current;
    }
}
