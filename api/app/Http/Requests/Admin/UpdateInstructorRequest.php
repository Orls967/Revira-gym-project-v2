<?php

namespace App\Http\Requests\Admin;

/**
 * PUT memakai aturan yang sama dengan POST; is_active yang tidak dikirim tidak mengubah status.
 */
class UpdateInstructorRequest extends StoreInstructorRequest {}
