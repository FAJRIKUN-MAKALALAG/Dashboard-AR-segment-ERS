<?php

use App\Http\Controllers\ArDashboardController;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

Route::middleware(['auth:sanctum', 'throttle:30,1'])->group(function () {
    Route::get('/v1/ar-dashboard', [ArDashboardController::class, 'index']);
    Route::get('/v1/tables/{table}', [ArDashboardController::class, 'getTable']);
    Route::post('/v1/tables/{table}', [ArDashboardController::class, 'createRow']);
    Route::put('/v1/tables/{table}/{id}', [ArDashboardController::class, 'updateRow']);
    Route::delete('/v1/tables/{table}/{id}', [ArDashboardController::class, 'deleteRow']);
});

Route::post('/v1/dev-token', function (Request $request) {
    $validated = $request->validate([
        'email' => ['required', 'email'],
        'name' => ['sometimes', 'string', 'max:255'],
    ]);

    $user = User::query()->firstOrCreate(
        ['email' => $validated['email']],
        [
            'name' => $validated['name'] ?? Str::before($validated['email'], '@'),
            'password' => Hash::make(Str::random(32)),
        ],
    );

    $token = $user->createToken('ar-dashboard-dev')->plainTextToken;

    return response()->json([
        'success' => true,
        'token_type' => 'Bearer',
        'token' => $token,
        'user' => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ],
    ]);
});
