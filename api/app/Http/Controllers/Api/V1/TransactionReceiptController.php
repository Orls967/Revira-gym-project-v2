<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use App\Services\ReceiptStorage;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Penyajian file bukti transfer pembayaran secara terautentikasi.
 *
 * Hanya admin atau pemilik transaksi (member bersangkutan) yang dapat mengakses
 * bukti transfer.
 */
class TransactionReceiptController extends Controller
{
    public function __construct(
        private readonly ReceiptStorage $receiptStorage
    ) {}

    /**
     * GET /api/v1/transactions/{transaction}/receipt
     * Menyajikan file bukti transfer secara privat kepada admin atau pemilik transaksi.
     */
    public function show(Transaction $transaction): Response
    {
        Gate::authorize('view', $transaction);

        if (! $transaction->receipt_image || ! $this->receiptStorage->exists($transaction->receipt_image)) {
            return response()->json([
                'message' => 'Bukti transfer tidak ditemukan.',
            ], 404);
        }

        return $this->receiptStorage->response($transaction->receipt_image);
    }
}
