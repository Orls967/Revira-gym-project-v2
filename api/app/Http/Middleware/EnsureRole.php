<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Membatasi akses route berdasarkan peran user, mis. role:admin atau role:admin,member.
 * Dipasang setelah auth:sanctum supaya user sudah terautentikasi.
 */
class EnsureRole
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        // Jaga-jaga bila middleware dipasang tanpa auth:sanctum: tetap balas 401 JSON
        if (! $user) {
            throw new AuthenticationException;
        }

        if (! in_array($user->role?->value, $roles, true)) {
            return response()->json([
                'message' => 'Anda tidak memiliki akses ke sumber daya ini.',
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
