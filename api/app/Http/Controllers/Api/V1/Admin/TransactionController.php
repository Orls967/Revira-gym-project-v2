<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\IndexTransactionRequest;
use App\Http\Requests\Admin\RejectTransactionRequest;
use App\Http\Resources\AdminMembershipSummaryResource;
use App\Http\Resources\AdminTransactionResource;
use App\Models\Transaction;
use App\Services\Transactions\TransactionVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransactionController extends Controller
{
    public function __construct(
        private readonly TransactionVerificationService $verificationService
    ) {}

    /**
     * GET /api/v1/admin/transactions
     *
     * Daftar transaksi per status verifikasi (default: pending).
     * Paginasi tetap 15 data per halaman.
     */
    public function index(IndexTransactionRequest $request): JsonResponse
    {
        $status = $request->input('status', 'pending');

        $query = Transaction::query()
            ->where('verification_status', $status)
            ->with(['user', 'membership.membershipPlan']);

        if ($status === 'pending') {
            $query->orderBy('created_at', 'asc')->orderBy('id', 'asc');
        } else {
            $query->orderBy('created_at', 'desc')->orderBy('id', 'desc');
        }

        $transactions = $query->paginate(15)->withQueryString();

        return AdminTransactionResource::collection($transactions)->response();
    }

    /**
     * POST /api/v1/admin/transactions/{transaction}/approve
     *
     * Setujui transaksi pending dan aktifkan membership (SCRUM-67).
     */
    public function approve(Request $request, Transaction $transaction): JsonResponse
    {
        $updated = $this->verificationService->approve($transaction, $request->user());

        return response()->json([
            'message' => 'Transaksi disetujui. Membership member sudah aktif.',
            'data' => [
                'transaction' => new AdminTransactionResource($updated),
                'membership' => new AdminMembershipSummaryResource($updated->membership),
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/transactions/{transaction}/reject
     *
     * Tolak transaksi pending dengan alasan penolakan (SCRUM-67).
     */
    public function reject(RejectTransactionRequest $request, Transaction $transaction): JsonResponse
    {
        $updated = $this->verificationService->reject(
            $transaction,
            $request->user(),
            $request->validated('reject_reason')
        );

        return response()->json([
            'message' => 'Transaksi ditolak.',
            'data' => [
                'transaction' => new AdminTransactionResource($updated),
                'membership' => new AdminMembershipSummaryResource($updated->membership),
            ],
        ]);
    }
}
