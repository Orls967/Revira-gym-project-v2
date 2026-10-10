<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\TransactionReceiptController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Endpoint health check untuk memantau status server API
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'time' => now()->toIso8601String(),
    ]);
});

// Login dibatasi 5 percobaan per menit untuk mencegah tebak password
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Registrasi akun member dari aplikasi mobile, dibatasi seperti login untuk mencegah spam akun.
// Prefix "register" memisahkan hitungannya dari login; tanpa prefix keduanya berbagi kuota per IP.
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:5,1,register');

Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

// Profil + status membership; dipakai app untuk mengaktifkan tombol booking
Route::get('/me', MeController::class)->middleware(['auth:sanctum', 'role:member']);

// Route contoh yang dilindungi Bearer token Sanctum; tanpa token valid mengembalikan 401 JSON
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Penyajian bukti transfer terautentikasi (admin atau pemilik transaksi)
Route::middleware('auth:sanctum')->prefix('transactions')->group(function () {
    Route::get('/{transaction}/receipt', [TransactionReceiptController::class, 'show']);
});

// Route ping untuk membuktikan middleware role; route admin/member berikutnya mengikuti pola grup ini
Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    Route::get('/ping', fn () => response()->json(['message' => 'pong', 'role' => 'admin']));
});

Route::middleware(['auth:sanctum', 'role:member'])->prefix('member')->group(function () {
    Route::get('/ping', fn () => response()->json(['message' => 'pong', 'role' => 'member']));
});
