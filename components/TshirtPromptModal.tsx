
import React, { useState } from 'react';
import { X, Sparkles, MessageSquare, Lightbulb, ArrowRight, Shirt, Wand2, Info } from 'lucide-react';
import { ProductAnalysis } from '../types';

interface TshirtPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: ProductAnalysis;
  processedImage: string | null;
  onGenerate: (userPrompt: string) => void;
}

export const TshirtPromptModal: React.FC<TshirtPromptModalProps> = ({
  isOpen,
  onClose,
  analysis,
  processedImage,
  onGenerate
}) => {
  const [userAddition, setUserAddition] = useState('');

  if (!isOpen) return null;

  const suggestions = [
    "Thêm phong cách Vintage 90s Bootleg",
    "Chuyển sang dạng Vector Line-art tối giản",
    "Phối màu Cyberpunk Neon rực rỡ",
    "Tạo hiệu ứng vẽ tay Watercolor nghệ thuật",
    "Thêm texture Distressed Grunge cổ điển"
  ];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md transition-opacity" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-3xl bg-slate-900 shadow-2xl transition-all w-full max-w-5xl border border-slate-800 flex flex-col lg:flex-row">
          
          {/* Left: Phân tích DNA Gốc */}
          <div className="w-full lg:w-1/3 bg-slate-950 p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800">
             <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-indigo-900/30 rounded-lg text-indigo-400 border border-indigo-500/20">
                    <Shirt size={20} />
                </div>
                <h4 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Original DNA</h4>
             </div>
             
             <div className="relative aspect-square w-full bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] rounded-2xl border border-slate-800 overflow-hidden mb-6">
                {processedImage && <img src={processedImage} alt="Preview" className="w-full h-full object-contain p-4" />}
             </div>
             
             <div className="flex-1 space-y-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center mb-2">
                        <Info size={12} className="mr-1" /> Phân tích cấu trúc
                    </label>
                    <p className="text-xs text-slate-300 leading-relaxed italic">
                      "{analysis.description}"
                    </p>
                </div>
                <div className="p-4 bg-indigo-950/20 rounded-xl border border-indigo-900/30">
                    <label className="text-[10px] font-bold text-indigo-400 uppercase flex items-center mb-2">
                        <Sparkles size={12} className="mr-1" /> Chiến lược thiết kế
                    </label>
                    <p className="text-xs text-indigo-200 leading-relaxed">
                      {analysis.designCritique}
                    </p>
                </div>
             </div>
          </div>

          {/* Right: Input & Suggestions */}
          <div className="flex-1 p-8 flex flex-col bg-slate-900">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h3 className="text-2xl font-bold text-white flex items-center">
                        <Wand2 className="text-purple-500 mr-3" size={24} />
                        Nâng cấp Thiết kế (Pro Mode)
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">AI sẽ giữ nguyên form dáng gốc và áp dụng thêm gợi ý của bạn.</p>
                </div>
                <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors bg-slate-800 rounded-full">
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-8 flex-1">
                {/* Suggestions Tags */}
                <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center">
                        <Lightbulb size={14} className="mr-2 text-amber-500" />
                        Gợi ý phong cách Trending
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {suggestions.map((s, i) => (
                            <button 
                                key={i}
                                onClick={() => setUserAddition(prev => prev ? prev + ', ' + s : s)}
                                className="px-4 py-2 bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-400 rounded-full text-xs text-slate-300 hover:text-white transition-all flex items-center"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Input */}
                <div className="space-y-3">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center">
                        <MessageSquare size={14} className="mr-2 text-purple-500" />
                        Gợi ý bổ sung của bạn (Tùy chọn)
                    </label>
                    <div className="relative">
                        <textarea 
                            value={userAddition}
                            onChange={(e) => setUserAddition(e.target.value)}
                            placeholder="Ví dụ: Làm cho màu sắc tươi sáng hơn, thêm viền đậm cho nhân vật, tạo cảm giác retro..."
                            className="w-full h-48 bg-slate-950 border border-slate-700 rounded-2xl p-5 text-sm text-slate-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none resize-none shadow-inner"
                        />
                        <div className="absolute bottom-4 right-4 text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                            Keep original form: Active
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-10 flex space-x-4">
                <button 
                    onClick={onClose}
                    className="px-8 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all"
                >
                    Hủy bỏ
                </button>
                <button 
                    onClick={() => onGenerate(userAddition)}
                    className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-3"
                >
                    <Sparkles size={20} />
                    <span>Tạo 3 Biến thể Chuyên nghiệp</span>
                </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
