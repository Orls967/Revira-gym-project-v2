<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\IndexGymClassRequest;
use App\Http\Requests\Admin\StoreGymClassRequest;
use App\Http\Requests\Admin\UpdateGymClassRequest;
use App\Http\Resources\GymClassResource;
use App\Models\GymClass;
use Illuminate\Http\JsonResponse;

class GymClassController extends Controller
{
    /**
     * GET /api/v1/admin/classes
     *
     * Paginasi format Laravel (data, links, meta) dengan filter is_active dan pencarian nama.
     */
    public function index(IndexGymClassRequest $request): JsonResponse
    {
        $isActive = $request->isActiveFilter();
        $search = $request->validated('search');

        $classes = GymClass::query()
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

        return GymClassResource::collection($classes)->response();
    }

    /**
     * POST /api/v1/admin/classes
     */
    public function store(StoreGymClassRequest $request): JsonResponse
    {
        $class = GymClass::create($request->validated());

        return response()->json([
            'message' => 'Kelas berhasil dibuat.',
            'data' => new GymClassResource($class->refresh()),
        ], 201);
    }

    /**
     * GET /api/v1/admin/classes/{gymClass}
     */
    public function show(GymClass $gymClass): JsonResponse
    {
        return response()->json([
            'data' => new GymClassResource($gymClass),
        ]);
    }

    /**
     * PUT /api/v1/admin/classes/{gymClass}
     */
    public function update(UpdateGymClassRequest $request, GymClass $gymClass): JsonResponse
    {
        $gymClass->update($request->validated());

        return response()->json([
            'message' => 'Kelas berhasil diperbarui.',
            'data' => new GymClassResource($gymClass),
        ]);
    }

    /**
     * DELETE /api/v1/admin/classes/{gymClass}
     *
     * Kelas yang sudah punya jadwal tidak dihapus (FK restrict); admin diarahkan menonaktifkannya.
     */
    public function destroy(GymClass $gymClass): JsonResponse
    {
        if ($gymClass->classSchedules()->exists()) {
            return response()->json([
                'message' => 'Kelas tidak dapat dihapus karena sudah memiliki jadwal. Silakan nonaktifkan kelas (is_active = false) sebagai alternatif.',
            ], 409);
        }

        $gymClass->delete();

        return response()->json([
            'message' => 'Kelas berhasil dihapus.',
        ]);
    }
}
