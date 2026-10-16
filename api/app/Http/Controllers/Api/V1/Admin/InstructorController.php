<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\IndexInstructorRequest;
use App\Http\Requests\Admin\StoreInstructorRequest;
use App\Http\Requests\Admin\UpdateInstructorRequest;
use App\Http\Resources\InstructorResource;
use App\Models\Instructor;
use Illuminate\Http\JsonResponse;

class InstructorController extends Controller
{
    /**
     * GET /api/v1/admin/instructors
     *
     * Paginasi format Laravel (data, links, meta) dengan filter is_active dan pencarian nama.
     */
    public function index(IndexInstructorRequest $request): JsonResponse
    {
        $isActive = $request->isActiveFilter();
        $search = $request->validated('search');

        $instructors = Instructor::query()
            ->when($isActive !== null, fn ($query) => $query->where('is_active', $isActive))
            // % dan _ di kata kunci dicari apa adanya, bukan sebagai wildcard LIKE.
            // Karakter escape '!' dipakai karena backslash tidak berlaku sama di MySQL dan SQLite.
            ->when(filled($search), fn ($query) => $query->whereRaw(
                "name LIKE ? ESCAPE '!'",
                ['%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%'],
            ))
            ->orderBy('id')
            ->paginate($request->integer('per_page', 15))
            ->withQueryString();

        return InstructorResource::collection($instructors)->response();
    }

    /**
     * POST /api/v1/admin/instructors
     */
    public function store(StoreInstructorRequest $request): JsonResponse
    {
        $instructor = Instructor::create($request->validated());

        return response()->json([
            'message' => 'Instruktur berhasil dibuat.',
            'data' => new InstructorResource($instructor->refresh()),
        ], 201);
    }

    /**
     * GET /api/v1/admin/instructors/{instructor}
     */
    public function show(Instructor $instructor): JsonResponse
    {
        return response()->json([
            'data' => new InstructorResource($instructor),
        ]);
    }

    /**
     * PUT /api/v1/admin/instructors/{instructor}
     *
     * Menonaktifkan instruktur ditolak selama masih ada jadwal mendatang, agar jadwal itu
     * tidak tercatat dengan instruktur nonaktif. Instruktur yang sudah nonaktif tetap bisa diubah.
     */
    public function update(UpdateInstructorRequest $request, Instructor $instructor): JsonResponse
    {
        $deactivating = $instructor->is_active && $request->has('is_active') && ! $request->boolean('is_active');

        if ($deactivating && $instructor->classSchedules()->upcoming()->exists()) {
            return response()->json([
                'message' => 'Instruktur tidak dapat dinonaktifkan karena masih memiliki jadwal mendatang. Silakan pindahkan jadwal ke instruktur lain atau batalkan jadwal tersebut lebih dulu.',
            ], 409);
        }

        $instructor->update($request->validated());

        return response()->json([
            'message' => 'Instruktur berhasil diperbarui.',
            'data' => new InstructorResource($instructor),
        ]);
    }

    /**
     * DELETE /api/v1/admin/instructors/{instructor}
     *
     * Instruktur yang dipakai jadwal atau sebagai instruktur default kelas tidak dihapus (FK restrict).
     * Jadwal yang dibatalkan tetap menyimpan instruktur, jadi ikut menghalangi penghapusan.
     */
    public function destroy(Instructor $instructor): JsonResponse
    {
        if ($instructor->classSchedules()->exists()) {
            return response()->json([
                'message' => 'Instruktur tidak dapat dihapus karena sudah memiliki jadwal. Silakan pindahkan jadwal ke instruktur lain lebih dulu, atau nonaktifkan instruktur (is_active = false) sebagai alternatif.',
            ], 409);
        }

        if ($instructor->defaultClasses()->exists()) {
            return response()->json([
                'message' => 'Instruktur tidak dapat dihapus karena masih menjadi instruktur default kelas. Silakan ganti instruktur default kelas tersebut lebih dulu, atau nonaktifkan instruktur (is_active = false) sebagai alternatif.',
            ], 409);
        }

        $instructor->delete();

        return response()->json([
            'message' => 'Instruktur berhasil dihapus.',
        ]);
    }
}
