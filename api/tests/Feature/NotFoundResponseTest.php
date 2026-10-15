<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

class NotFoundResponseTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('api')->prefix('api/v1')->group(function () {
            // Route model binding untuk pengujian binding gagal
            Route::get('/test-binding/{user}', fn (User $user) => response()->json(['id' => $user->id]));

            // Route dengan pesan 404 khusus via abort()
            Route::get('/test-abort-custom', fn () => abort(404, 'Pesan khusus uji'));

            // Route dengan pesan 404 khusus via throw NotFoundHttpException
            Route::get('/test-throw-custom', fn () => throw new NotFoundHttpException('Pesan khusus lain'));
        });
    }

    public function test_route_model_binding_missing_returns_standardized_404(): void
    {
        $response = $this->getJson('/api/v1/test-binding/999999');

        $response->assertStatus(404)
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);

        $this->assertStringNotContainsString('App\\Models', $response->getContent());
    }

    public function test_non_existent_api_route_returns_standardized_404(): void
    {
        $response = $this->getJson('/api/v1/route-tidak-ada');

        $response->assertStatus(404)
            ->assertExactJson(['message' => 'Data tidak ditemukan.']);
    }

    public function test_abort_with_custom_message_preserves_custom_message(): void
    {
        $response = $this->getJson('/api/v1/test-abort-custom');

        $response->assertStatus(404)
            ->assertExactJson(['message' => 'Pesan khusus uji']);
    }

    public function test_throw_not_found_http_exception_with_custom_message_preserves_custom_message(): void
    {
        $response = $this->getJson('/api/v1/test-throw-custom');

        $response->assertStatus(404)
            ->assertExactJson(['message' => 'Pesan khusus lain']);
    }
}
