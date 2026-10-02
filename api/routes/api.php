<?php

use App\Http\Controllers\Api\V1\AuthController;
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

Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');

// Route contoh yang dilindungi Bearer token Sanctum; tanpa token valid mengembalikan 401 JSON
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Route ping untuk membuktikan middleware role; route admin/member berikutnya mengikuti pola grup ini
Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    Route::get('/ping', fn () => response()->json(['message' => 'pong', 'role' => 'admin']));
});

Route::middleware(['auth:sanctum', 'role:member'])->prefix('member')->group(function () {
    Route::get('/ping', fn () => response()->json(['message' => 'pong', 'role' => 'member']));
});
