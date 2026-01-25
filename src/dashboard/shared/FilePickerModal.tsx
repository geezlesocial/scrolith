import React, { useEffect, useMemo, useState } from "react";
import { X, Search, Upload, FileImage, FileVideo, FileText, Check } from "lucide-react";
import { FileService } from "../../services/files";
import { UploadedFile } from "../../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (files: UploadedFile[]) => void;
  multiple?: boolean;
  role?: string;
  visibility?: "public" | "private";
  acceptedTypes?: Array<"image" | "video" | "document">;
};

export default function FilePickerModal({
  open,
  onClose,
  onSelect,
  multiple = false,
  role,
  visibility = "public",
  acceptedTypes,
}: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "document">("all");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const res = await FileService.getFiles({
        role,
        visibility,
        search: search || undefined,
        type: filterType === "all" ? undefined : filterType,
        limit: 50,
        page: 1,
      });
      setFiles(res.files || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filterType]);

  const visibleFiles = useMemo(() => {
    let list = files;
    if (acceptedTypes && acceptedTypes.length > 0) {
      list = list.filter((f) => {
        const t = f.type as unknown as string;
        return acceptedTypes.includes(t as "image" | "video" | "document");
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => (f.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [files, search, acceptedTypes]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (!multiple) return { [id]: true };
      return { ...prev, [id]: !prev[id] };
    });
  };

  const confirm = () => {
    const picked = visibleFiles.filter((f) => selected[f.id]);
    onSelect(picked);
    onClose();
  };

  const uploadNew = async (file: File) => {
    setUploading(true);
    try {
      // category mapping: you already use 'portfolio' for images/videos and 'document' for docs
      const category = file.type.startsWith("image/")
        ? "portfolio"
        : file.type.startsWith("video/")
        ? "portfolio"
        : "document";

      await FileService.uploadFile(file, category, { role, visibility });
      await loadFiles();
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  const iconFor = (t: string) => {
    if (t === "image") return <FileImage className="w-4 h-4" />;
    if (t === "video") return <FileVideo className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-bold text-gray-900">Select from Uploaded Files</h3>
            <p className="text-xs text-gray-500">Upload new files here or pick existing ones. No direct uploads outside this library.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex gap-2 items-center flex-1">
              <div className="flex items-center bg-gray-50 border rounded-xl px-3 py-2 w-full">
                <Search className="w-4 h-4 text-gray-400 mr-2" />
                <input
                  className="bg-transparent outline-none w-full text-sm"
                  placeholder="Search files by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="border rounded-xl px-3 py-2 text-sm"
                value={filterType}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "all" || v === "image" || v === "video" || v === "document") {
                    setFilterType(v as "all" | "image" | "video" | "document");
                  } else {
                    setFilterType("all");
                  }
                }}
              >
                <option value="all">All</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="document">Documents</option>
              </select>
            </div>

            <label className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold cursor-pointer hover:bg-blue-700">
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload New"}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadNew(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-h-[55vh] overflow-y-auto">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />
              ))
            ) : visibleFiles.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 py-12">
                No files found. Upload a file to get started.
              </div>
            ) : (
              visibleFiles.map((f) => (
                <button
                  key={f.id}
                  onClick={() => toggle(f.id)}
                  className={`border rounded-xl p-3 text-left hover:shadow-sm transition ${
                    selected[f.id] ? "border-blue-600 ring-2 ring-blue-100" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      {iconFor(f.type)}
                      {f.type}
                    </span>
                    {selected[f.id] && <Check className="w-4 h-4 text-blue-600" />}
                  </div>

                  {f.type === "image" ? (
                    <img src={f.url} alt={f.name} className="w-full h-24 object-cover rounded-lg mb-2" />
                  ) : f.type === "video" ? (
                    <video src={f.url} className="w-full h-24 object-cover rounded-lg mb-2" />
                  ) : (
                    <div className="w-full h-24 bg-gray-50 rounded-lg flex items-center justify-center mb-2 text-gray-400">
                      <FileText className="w-8 h-8" />
                    </div>
                  )}

                  <div className="text-sm font-bold text-gray-900 truncate">{f.name}</div>
                  <div className="text-[11px] text-gray-500 mt-1">
                    {(f.size / 1024 / 1024).toFixed(2)} MB
                  </div>

                  {(() => {
                    const usedIn = (f as unknown as { usedIn?: unknown }).usedIn;
                    if (Array.isArray(usedIn) && usedIn.length > 0) {
                      const first = usedIn.slice(0, 1).map((u: unknown) => {
                        const obj = u as { type?: string; id?: string | number };
                        return `${obj.type ?? 'item'} #${obj.id ?? '?'}`;
                      });
                      return (
                        <div className="mt-2 text-[10px] text-gray-500">Used in: {first.join(', ')}</div>
                      );
                    }
                    return null;
                  })()}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-bold">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={Object.values(selected).filter(Boolean).length === 0}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
          >
            Use Selected
          </button>
        </div>
      </div>
    </div>
  );
}