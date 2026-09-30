<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Endpoint health check untuk memantau status server API
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'time' => now()->toIso8601String(),
    ]);
});

// Route contoh yang dilindungi Bearer token Sanctum; tanpa token valid mengembalikan 401 JSON
Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
