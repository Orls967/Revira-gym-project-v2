<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\IndexMemberRequest;
use App\Http\Resources\AdminMemberResource;
use App\Services\Members\MemberListing;
use Illuminate\Http\JsonResponse;

class MemberController extends Controller
{
    public function __construct(private readonly MemberListing $memberListing) {}

    /**
     * GET /api/v1/admin/members
     *
     * Daftar member dengan status membership terkini (B11), filter status/paket, pencarian nama/email/HP.
     * Paginasi tetap 15 data per halaman, urut nama.
     */
    public function index(IndexMemberRequest $request): JsonResponse
    {
        $members = $this->memberListing->paginate($request->validated());

        return AdminMemberResource::collection($members)->response();
    }
}
