<?php

namespace App\Providers;

use App\Contracts\WhatsAppSender;
use App\Services\WhatsApp\FonnteWhatsAppSender;
use App\Services\WhatsApp\LogWhatsAppSender;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(WhatsAppSender::class, function () {
            $config = config('services.whatsapp');

            return match ($config['driver']) {
                'log' => new LogWhatsAppSender,
                'fonnte' => new FonnteWhatsAppSender($config['token'], (int) $config['timeout']),
                default => throw new InvalidArgumentException("Driver WhatsApp [{$config['driver']}] tidak dikenal."),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('public-api', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });
    }
}
