
import React, { useState } from 'react';
import { X, Sparkles, Tag, Loader2 } from 'lucide-react';

interface ThemeInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  processedImage: string | null;
  isSubmitting: boolean;
  onSubmit: (theme: string) => void;
}

const SUGGESTIONS = [
  "Father's Day",
  "Mother's Day",
  "Christmas",
  "Coach Appreciation",
  "Teacher Appreciation",
  "Birthday Gift",
];

export const ThemeInputModal: React.FC<ThemeInputModalProps> = ({
  isOpen,
  onClose,
  processedImage,
  isSubmitting,
  onSubmit
}) => {
  const [theme, setTheme] = useState('');

  if (!isOpen) return null;

  const submit = () => {
    if (!theme.trim() || isSubmitting) return;
    onSubmit(theme.trim());
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md transition-opacity" onClick={isSubmitting ? undefined : onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-3xl bg-slate-900 shadow-2xl transition-all w-full max-w-lg border border-slate-800 p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center">
                <Tag className="text-indigo-500 mr-2" size={22} />
                Chủ đề sản phẩm
              </h3>
              <p className="text-sm text-slate-500 mt-1">Nhập chủ đề/dịp bạn muốn tạo, AI sẽ tự động phân tích &amp; tạo thiết kế theo chủ đề này.</p>
            </div>
            {!isSubmitting && (
              <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors bg-slate-800 rounded-full">
                <X size={18} />
              </button>
            )}
          </div>

          {processedImage && (
            <div className="relative aspect-video w-full bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] rounded-2xl border border-slate-800 overflow-hidden mb-6">
              <img src={processedImage} alt="Preview" className="w-full h-full object-contain p-3" />
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={isSubmitting}
                onClick={() => setTheme(s)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-400 rounded-full text-xs text-slate-300 hover:text-white transition-all disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            disabled={isSubmitting}
            autoFocus
            placeholder="VD: Father's Day, Coach Appreciation, Christmas gift for teacher..."
            className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none shadow-inner disabled:opacity-60"
          />

          <div className="mt-6 flex space-x-4">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              onClick={submit}
              disabled={!theme.trim() || isSubmitting}
              className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50 disabled:hover:scale-100"
            >
              {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              <span>{isSubmitting ? 'Đang tạo thiết kế...' : 'Xác nhận & Tự động tạo'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
