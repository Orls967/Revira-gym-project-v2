<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\IndexTransactionRequest;
use App\Http\Resources\AdminTransactionResource;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;

class TransactionController extends Controller
{
    /**
     * GET /api/v1/admin/transactions
     *
     * Daftar transaksi per status verifikasi (default: pending).
     * Paginasi tetap 15 data per halaman.
     */
    public function index(IndexTransactionRequest $request): JsonResponse
    {
        $status = $request->validated('status') ?? 'pending';

        $query = Transaction::query()
            ->where('verification_status', $status)
            ->with(['user', 'membership.membershipPlan']);

        if ($status === 'pending') {
            $query->orderBy('created_at', 'asc')->orderBy('id', 'asc');
        } else {
            $query->orderByDesc('verified_at')->orderByDesc('id');
        }

        $transactions = $query->paginate(15)->withQueryString();

        return AdminTransactionResource::collection($transactions)->response();
    }
}
