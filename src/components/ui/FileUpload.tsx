"use client";

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import {
  Upload,
  File,
  FileImage,
  FileText,
  FileAudio,
  X,
  Image,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { FileAttachment } from "@/types";

interface UploadFile {
  id: string;
  file: File;
  preview?: string;
  progress: number;
  status: "uploading" | "done" | "error";
  attachment?: FileAttachment;
}

interface FileUploadProps {
  onUpload: (files: File[]) => Promise<FileAttachment[]>;
  existingFiles?: FileAttachment[];
  onDelete?: (fileId: string) => Promise<void>;
  accept?: string;
  maxFiles?: number;
  maxSizeMB?: number;
  className?: string;
  disabled?: boolean;
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return FileImage;
  if (fileType.startsWith("audio/")) return FileAudio;
  if (fileType.includes("pdf")) return FileText;
  if (fileType.includes("document") || fileType.includes("word") || fileType.includes("text")) return FileText;
  return File;
}

function getFileTypeLabel(fileType: string): string {
  if (fileType.startsWith("image/")) return "Imagen";
  if (fileType.startsWith("audio/")) return "Audio";
  if (fileType.includes("pdf")) return "PDF";
  if (fileType.includes("document") || fileType.includes("word")) return "Documento";
  return "Archivo";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function FileUpload({
  onUpload,
  existingFiles = [],
  onDelete,
  accept = "*",
  maxFiles = 10,
  maxSizeMB = 20,
  className,
  disabled = false,
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const totalFiles = files.length + existingFiles.length;

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const remaining = maxFiles - totalFiles;
    if (remaining <= 0) return;

    const newFiles: File[] = [];
    const fileArr = Array.from(fileList);

    for (const file of fileArr) {
      if (newFiles.length >= remaining) break;
      if (file.size > maxSizeMB * 1048576) continue;
      newFiles.push(file);
    }

    const uploadFiles: UploadFile[] = newFiles.map((file) => ({
      id: `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      progress: 0,
      status: "uploading" as const,
    }));

    setFiles((prev) => [...prev, ...uploadFiles]);

    try {
      const progressFiles = uploadFiles.map((uf) => {
        const interval = setInterval(() => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uf.id && f.status === "uploading"
                ? { ...f, progress: Math.min(f.progress + Math.random() * 20 + 10, 90) }
                : f
            )
          );
        }, 200);

        return () => clearInterval(interval);
      });

      const attachments = await onUpload(newFiles);

      progressFiles.forEach((cleanup) => cleanup());

      setFiles((prev) =>
        prev.map((f) => {
          if (f.status === "uploading") {
            const idx = newFiles.indexOf(f.file);
            if (idx >= 0 && idx < attachments.length) {
              return { ...f, progress: 100, status: "done", attachment: attachments[idx] };
            }
            return { ...f, status: "error" };
          }
          return f;
        })
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "error" } : f
        )
      );
    }
  }, [maxFiles, totalFiles, maxSizeMB, onUpload]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) {
      processFiles(e.dataTransfer.files);
    }
  }, [disabled, processFiles]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  }, [processFiles]);

  const removeFile = useCallback((fileId: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === fileId);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== fileId);
    });
  }, []);

  const handleDeleteExisting = useCallback(async (fileId: string) => {
    if (!onDelete) return;
    setDeletingFiles((prev) => new Set(prev).add(fileId));
    try {
      await onDelete(fileId);
    } finally {
      setDeletingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  }, [onDelete]);

  return (
    <div className={cn("space-y-4", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
          isDragging
            ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50 dark:bg-gray-800/30",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple
          onChange={handleFileSelect}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-10 w-10 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Arrastra archivos aquí o haz clic para subir
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Máximo {maxFiles} archivos · Hasta {maxSizeMB} MB cada uno
            </p>
          </div>
        </div>
      </div>

      {(files.length > 0 || existingFiles.length > 0) && (
        <div className="space-y-2">
          {existingFiles.map((ef) => (
            <div
              key={ef.id}
              className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <Image className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {ef.fileName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getFileTypeLabel(ef.fileType)} · {formatFileSize(ef.fileSize)}
                </p>
              </div>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteExisting(ef.id)}
                  isLoading={deletingFiles.has(ef.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {files.map((uf) => {
            const IconComponent = getFileIcon(uf.file.type);
            return (
              <div
                key={uf.id}
                className={cn(
                  "flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg",
                  uf.status === "error" && "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10"
                )}
              >
                {uf.preview ? (
                  <img
                    src={uf.preview}
                    alt={uf.file.name}
                    className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <IconComponent className="h-5 w-5 text-gray-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {uf.file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {getFileTypeLabel(uf.file.type)} · {formatFileSize(uf.file.size)}
                    {uf.status === "done" && (
                      <span className="text-green-600 dark:text-green-400 ml-2">Completado</span>
                    )}
                    {uf.status === "error" && (
                      <span className="text-red-600 dark:text-red-400 ml-2">Error</span>
                    )}
                  </p>
                  {uf.status === "uploading" && (
                    <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${uf.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(uf.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
