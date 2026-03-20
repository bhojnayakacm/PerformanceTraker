"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileUp, FileX } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onFileAccepted: (file: File) => void;
  disabled?: boolean;
};

export function FileDropzone({ onFileAccepted, disabled }: Props) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: { file: File }[]) => {
      setError(null);

      if (rejectedFiles.length > 0) {
        setError("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
        return;
      }

      if (acceptedFiles.length > 0) {
        onFileAccepted(acceptedFiles[0]);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <FileUp className="h-10 w-10 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-sm font-medium">Drop your file here...</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              Drag & drop a file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports CSV, XLSX, and XLS files
            </p>
          </>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 mt-2 text-sm text-destructive">
          <FileX className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
