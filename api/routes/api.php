<?php

use App\Http\Controllers\Api\V1\Admin\MembershipPlanController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\MeController;
use App\Http\Controllers\Api\V1\PublicClassController;
use App\Http\Controllers\Api\V1\PublicOperationalHourController;
use App\Http\Controllers\Api\V1\PublicPlanController;
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

// Endpoint publik (tanpa autentikasi, throttled 120/menit)
Route::middleware('throttle:public-api')->group(function () {
    Route::get('/membership-plans', PublicPlanController::class);
    Route::get('/operational-hours', PublicOperationalHourController::class);
    Route::get('/classes', PublicClassController::class);
});

// Route ping untuk membuktikan middleware role; route admin/member berikutnya mengikuti pola grup ini
Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    Route::get('/ping', fn () => response()->json(['message' => 'pong', 'role' => 'admin']));

    // Manajemen paket membership (SCRUM-93)
    Route::get('/membership-plans', [MembershipPlanController::class, 'index']);
    Route::post('/membership-plans', [MembershipPlanController::class, 'store']);
    Route::get('/membership-plans/{membershipPlan}', [MembershipPlanController::class, 'show'])
        ->whereNumber('membershipPlan')
        ->missing(fn () => response()->json(['message' => 'Data tidak ditemukan.'], 404));
    Route::put('/membership-plans/{membershipPlan}', [MembershipPlanController::class, 'update'])
        ->whereNumber('membershipPlan')
        ->missing(fn () => response()->json(['message' => 'Data tidak ditemukan.'], 404));
    Route::delete('/membership-plans/{membershipPlan}', [MembershipPlanController::class, 'destroy'])
        ->whereNumber('membershipPlan')
        ->missing(fn () => response()->json(['message' => 'Data tidak ditemukan.'], 404));
});

Route::middleware(['auth:sanctum', 'role:member'])->prefix('member')->group(function () {
    Route::get('/ping', fn () => response()->json(['message' => 'pong', 'role' => 'member']));
});
