"use client";

import { useId, useState } from "react";
import { FileCheck2, UploadCloud } from "lucide-react";

type UploadBoxProps = {
  label: string;
  name?: string;
  required?: boolean;
  multiple?: boolean;
  accept?: string;
  hint?: string;
  onFilesChange?: (files: File[]) => void;
};

export function UploadBox({
  label,
  name,
  required = false,
  multiple = true,
  accept = ".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp",
  hint = "PDF / Excel / صورة · حتى 5 ملفات بإجمالي 10 ميجابايت",
  onFilesChange,
}: UploadBoxProps) {
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);

  return (
    <label className="erp-upload-box" htmlFor={id}>
      <span className="erp-upload-icon" aria-hidden="true">
        <UploadCloud className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="erp-upload-title">
          {label}
          {required ? <b>إلزامي</b> : null}
        </span>
        <span className="erp-upload-meta">
          {files.length
            ? `${files.length} ملف · ${files.map((file) => file.name).join("، ")}`
            : "لم يتم اختيار ملفات"}
        </span>
        <span className="erp-upload-hint">{hint}</span>
      </span>
      <span className="erp-upload-action">
        <FileCheck2 className="size-4" />
        اختيار ملف
      </span>
      <input
        id={id}
        name={name}
        type="file"
        multiple={multiple}
        required={required}
        accept={accept}
        onChange={(event) => {
          const next = Array.from(event.target.files || []);
          setFiles(next);
          onFilesChange?.(next);
        }}
      />
    </label>
  );
}
