<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Models\User;
use App\Services\Auth\ApiTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * Login dan logout dengan Bearer token Sanctum untuk aplikasi mobile dan Admin Web.
 */
class AuthController extends Controller
{
    private static ?string $dummyHash = null;

    public function __construct(private readonly ApiTokenService $tokens) {}

    /**
     * POST /api/v1/login. Berlaku untuk admin dan member; klien menentukan layar tujuan dari field role.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->validated('email'))->first();

        // Hash tetap dicek walau email tidak ada, agar waktu respons tidak membocorkan email yang terdaftar
        $passwordValid = Hash::check(
            $request->validated('password'),
            $user?->password ?? (self::$dummyHash ??= Hash::make('dummy-password')),
        );

        if (! $user || ! $passwordValid) {
            return response()->json(['message' => 'Email atau password salah.'], 401);
        }

        $token = $this->tokens->createToken($user, $request->validated('device_name'));

        return response()->json([
            'message' => 'Login berhasil',
            'data' => [
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                ],
            ],
        ]);
    }

    /**
     * POST /api/v1/register. Membuat akun member baru dan langsung login (token dikirim balik).
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = new User($request->safe()->only(['name', 'email', 'phone_number', 'password']));
        // role tidak boleh diisi dari input; registrasi publik selalu menjadi member
        $user->role = UserRole::Member;
        $user->save();

        $token = $this->tokens->createToken($user, $request->validated('device_name'));

        return response()->json([
            'message' => 'Registrasi berhasil',
            'data' => [
                'token' => $token->plainTextToken,
                'token_type' => 'Bearer',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                ],
            ],
        ], 201);
    }

    /**
     * POST /api/v1/logout. Mencabut token yang dipakai pada request ini saja.
     */
    public function logout(Request $request): JsonResponse
    {
        $this->tokens->revokeCurrentToken($request->user());

        return response()->json(['message' => 'Logout berhasil']);
    }
}
