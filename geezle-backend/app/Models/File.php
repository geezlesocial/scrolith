<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class File extends Model
{
    protected $table = 'files';

    protected $fillable = [
        'name',
        'mime_type',
        'size',
        'storage_key',
        'url',
        'visibility',
        'role',
        'used_in',
    ];

    protected $casts = [
        'size' => 'integer',
        'used_in' => 'array',
    ];
}
