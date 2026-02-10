<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\FilesController;

// Minimal Uploaded Files SSOT endpoints
Route::get('/files', [FilesController::class, 'index']);
Route::post('/files/upload', [FilesController::class, 'upload']);
Route::delete('/files/{id}', [FilesController::class, 'destroy']);
