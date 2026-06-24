import React, { useCallback, useEffect, useState } from 'react';
import { Upload, ClipboardPaste } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [pasted, setPasted] = useState(false);

  // Nghe Ctrl/⌘+V toàn trang: dán ảnh từ clipboard ở bất kỳ đâu.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFileSelect(file);
            setPasted(true);
            setTimeout(() => setPasted(false), 1500);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          onFileSelect(file);
        }
      }
    },
    [onFileSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-full h-64 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl bg-slate-900/50 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group hover:bg-slate-800/50"
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
        <div className="p-4 bg-slate-800 rounded-full text-indigo-400 group-hover:scale-110 transition-transform duration-300 mb-4 border border-slate-700 group-hover:border-indigo-500/50">
          <Upload size={32} />
        </div>
        <h3 className="text-lg font-semibold text-slate-200 group-hover:text-white transition-colors">Upload Product Image</h3>
        <p className="text-sm text-slate-500 mt-2">Kéo thả, bấm để chọn, hoặc dán ảnh (Ctrl/⌘+V)</p>
        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
          <ClipboardPaste size={12} /> JPG, PNG · hỗ trợ copy-paste
        </p>
      </label>
      {pasted && (
        <p className="text-xs text-emerald-400 mt-2 animate-fade-in">✓ Đã dán ảnh từ clipboard</p>
      )}
    </div>
  );
};