<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Models\File as UploadedFileModel;

class FilesController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->query('per_page', 25);
        $files = UploadedFileModel::orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => [
                'files' => $files->items(),
                'pagination' => [
                    'total' => $files->total(),
                    'per_page' => $files->perPage(),
                    'current_page' => $files->currentPage(),
                    'last_page' => $files->lastPage(),
                ],
            ],
        ]);
    }

    public function upload(Request $request)
    {
        if (!$request->hasFile('file')) {
            return response()->json(['success' => false, 'message' => 'No file provided'], 400);
        }

        $file = $request->file('file');
        $path = $file->store('uploads', 'public');
        $url = Storage::disk('public')->url($path);

        $model = UploadedFileModel::create([
            'name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'storage_key' => $path,
            'url' => $url,
            'visibility' => $request->input('visibility', 'public'),
            'role' => $request->input('role', null),
            'used_in' => json_encode([]),
        ]);

        return response()->json(['success' => true, 'data' => $model]);
    }

    public function destroy($id)
    {
        $model = UploadedFileModel::find($id);
        if (!$model) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        // prevent deletion if used
        $usedIn = $model->used_in ?? [];
        if (is_string($usedIn)) {
            $usedIn = json_decode($usedIn, true) ?: [];
        }

        if (!empty($usedIn)) {
            return response()->json(['success' => false, 'message' => 'File is in use', 'usedIn' => $usedIn], 409);
        }

        if ($model->storage_key) {
            Storage::disk('public')->delete($model->storage_key);
        }

        $model->delete();

        return response()->json(['success' => true]);
    }
}
