<?php

use App\Http\Middleware\EnsureRole;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(at: '*');
        $middleware->redirectGuestsTo(fn ($request) => $request->is('api/*') ? null : route('login'));

        // Pembatasan akses per peran, pakai bersama auth:sanctum, mis. role:admin atau role:admin,member
        $middleware->alias([
            'role' => EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Memastikan request api/* selalu menerima respons error berformat JSON
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Pesan 404 seragam untuk request api/*: model binding gagal atau route tidak ditemukan.
        // 404 yang sengaja diberi pesan khusus oleh kode aplikasi (abort(404, '...') atau
        // new NotFoundHttpException('...')) tetap tampil apa adanya.
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $message = $e->getMessage();
            $isModelNotFound = $e->getPrevious() instanceof ModelNotFoundException;
            $isRouteNotFound = (str_starts_with($message, 'The route ') && str_ends_with($message, 'could not be found.'))
                || str_starts_with($message, 'No query results for model');

            if ($isModelNotFound || $isRouteNotFound) {
                return response()->json(['message' => 'Data tidak ditemukan.'], 404);
            }

            return response()->json(['message' => $message ?: 'Data tidak ditemukan.'], 404);
        });
    })->create();
