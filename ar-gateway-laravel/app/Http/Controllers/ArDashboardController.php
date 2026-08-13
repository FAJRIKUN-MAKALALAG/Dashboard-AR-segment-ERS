<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ArDashboardController extends Controller
{
    public function index(Request $request)
    {
        try {
            $cacheKey = 'oracle_ar_data_cache';
            $isCached = Cache::has($cacheKey);
            $cacheStore = config('cache.default');
            $source = 'python-engine';

            $responsePayload = Cache::remember($cacheKey, 15, function () use (&$source) {
                $pythonServiceUrl = config('services.python_engine.url', 'http://127.0.0.1:8000/internal/v1/ar-data');

                $response = Http::timeout(5)->acceptJson()->get($pythonServiceUrl);

                if ($response->failed()) {
                    throw new \Exception('Gagal menghubungi Python Data Engine Service.');
                }

                $source = 'python-engine';
                return $response->json();
            });

            if ($isCached) {
                $source = 'cache';
            }

            return response()
                ->json([
                'success' => true,
                'cached' => $isCached,
                'cache_store' => $cacheStore,
                'source' => $source,
                'timestamp' => now()->toIso8601String(),
                'payload' => $responsePayload,
            ], 200)
                ->header('X-AR-Cache', $isCached ? 'HIT' : 'MISS')
                ->header('X-AR-Source', $source);
        } catch (\Throwable $e) {
            if (Cache::has($cacheKey)) {
                return response()
                    ->json([
                        'success' => true,
                        'cached' => true,
                        'cache_store' => config('cache.default'),
                        'source' => 'stale-cache',
                        'timestamp' => now()->toIso8601String(),
                        'warning' => 'Python service unavailable, using last cached payload.',
                        'payload' => Cache::get($cacheKey),
                    ], 200)
                    ->header('X-AR-Cache', 'STALE')
                    ->header('X-AR-Source', 'stale-cache');
            }

            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
