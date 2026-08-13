<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ArDashboardGatewayTest extends TestCase
{
    use RefreshDatabase;

    public function test_dev_token_route_issues_bearer_token(): void
    {
        $response = $this->postJson('/api/v1/dev-token', [
            'email' => 'tester@example.com',
            'name' => 'Tester',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonStructure([
                'success',
                'token_type',
                'token',
                'user' => ['id', 'name', 'email'],
            ]);

        $this->assertDatabaseHas('users', [
            'email' => 'tester@example.com',
            'name' => 'Tester',
        ]);
    }

    public function test_authenticated_dashboard_endpoint_returns_python_payload(): void
    {
        $user = User::factory()->create(['email' => 'auth@example.com']);
        $token = $user->createToken('test-token')->plainTextToken;

        Http::fake([
            '127.0.0.1:8000/internal/v1/ar-data' => Http::response([
                'status' => 'success',
                'summary' => [
                    'total_ar_m' => 120.5,
                    'total_layak_tagih_m' => 90.25,
                    'total_tidak_layak_m' => 30.25,
                    'total_records' => 1,
                ],
                'data' => [
                    [
                        'invoice_id' => 'INV-001',
                        'aging_category' => '0-3 bln',
                        'status_tagih' => 'AR LAYAK TAGIH',
                        'region' => 'JAKARTA',
                        'invoice_status' => 'SUDAH INVOICED',
                        'nilai_m' => 120.5,
                        'uic' => 'CGA & SEGMEN',
                        'due_date' => 'JUNI 2026',
                        'action_plan' => 'Monitoring bayar',
                    ],
                ],
            ], 200),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/ar-dashboard');

        $response->assertOk()
            ->assertHeader('X-AR-Source', 'python-engine')
            ->assertHeader('X-AR-Cache', 'MISS')
            ->assertJsonPath('success', true)
            ->assertJsonPath('payload.summary.total_ar_m', 120.5)
            ->assertJsonPath('payload.data.0.invoice_id', 'INV-001');
    }

    public function test_dashboard_endpoint_serves_cached_payload_on_second_request(): void
    {
        $user = User::factory()->create(['email' => 'cache@example.com']);
        $token = $user->createToken('test-token')->plainTextToken;

        Cache::flush();

        Http::fakeSequence()
            ->push([
                'status' => 'success',
                'summary' => [
                    'total_ar_m' => 200,
                    'total_layak_tagih_m' => 150,
                    'total_tidak_layak_m' => 50,
                    'total_records' => 1,
                ],
                'data' => [
                    [
                        'invoice_id' => 'INV-002',
                        'aging_category' => '4-12 bln',
                        'status_tagih' => 'AR TIDAK LAYAK TAGIH',
                        'region' => 'BANDUNG',
                        'invoice_status' => 'SUDAH INVOICED',
                        'nilai_m' => 200,
                        'uic' => 'CGA & SEGMEN',
                        'due_date' => 'JULI 2026',
                        'action_plan' => 'Follow up',
                    ],
                ],
            ], 200);

        $first = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/ar-dashboard');

        $first->assertOk()
            ->assertHeader('X-AR-Cache', 'MISS');

        $second = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/v1/ar-dashboard');

        $second->assertOk()
            ->assertHeader('X-AR-Cache', 'HIT')
            ->assertJsonPath('cached', true)
            ->assertJsonPath('payload.summary.total_ar_m', 200);
    }
}
