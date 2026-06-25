
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RefreshCw, Palette, Sparkles, Wand2, MessageSquare, Eraser, Scissors, Image as ImageIcon, RotateCcw, Hand, Save, Move, Maximize, CheckCircle2, Loader2, Copy, Trash2, Layers, LayoutGrid, Zap, Sliders, Monitor, ChevronDown, ChevronLeft, ChevronRight, FileDown, ZoomIn } from 'lucide-react';
import { saveMockupToSheet, getMockupsFromSheet, saveFinalMockupResult, getImageBase64 } from '../services/googleSheetService';
import { cleanupProductImage } from '../services/geminiPodService';
import { COLOR_OPTIONS, ROPE_OPTIONS, RopeType } from '../types';

interface RedesignDetailModalProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onRemix: (instruction: string) => Promise<void>;
  onRemoveBackground: () => Promise<void>;
  onSplit: () => Promise<string[]>;
  onGenerateMockup: (img: string, onPartial?: (imgs: string[]) => void) => Promise<string[]>;
  onUpdateImage?: (newImage: string) => void;
  isRemixing: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  isTShirtMode?: boolean; 
}

interface MockupItem {
  id?: string;
  name: string;
  url: string;
  base64?: string;
  storeName: string;
}

interface StoreGroup {
  storeName: string;
  mockups: MockupItem[];
}

export const applyAlphaFilter = async (src: string): Promise<string> => {
    let finalSrc = src;
    if (src.startsWith('http')) {
        try {
            finalSrc = await getImageBase64(src);
        } catch (e) {
            console.error("Alpha filter proxy fetch failed", e);
        }
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) { resolve(finalSrc); return; }
            ctx.drawImage(img, 0, 0);
            const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = idata.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const diff = max - min;
                const brightness = (r + g + b) / 3;
                if (brightness > 240 && diff < 12) data[i+3] = 0;
            }
            ctx.putImageData(idata, 0, 0);
            resolve(canvas.toDataURL('image/png', 1.0));
        };
        img.onerror = () => resolve(finalSrc);
        img.src = finalSrc;
    });
};

export const RedesignDetailModal: React.FC<RedesignDetailModalProps> = ({
  imageUrl, isOpen, onClose, onRemix, onRemoveBackground, onSplit, onGenerateMockup, onUpdateImage, isRemixing, onUndo, canUndo, isTShirtMode
}) => {
  void onRemoveBackground; void onUpdateImage;
  const [aiMockups, setAiMockups] = useState<string[]>([]);
  const [showMockups, setShowMockups] = useState(false);
  const [isMockuping, setIsMockuping] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const MOCKUP_COUNT = 6;
  const lightboxPrev = () => setLightboxIndex((p) => (p === null ? null : (p - 1 + aiMockups.length) % aiMockups.length));
  const lightboxNext = () => setLightboxIndex((p) => (p === null ? null : (p + 1) % aiMockups.length));
  const handleAiMockup = async () => {
    setIsMockuping(true);
    setAiMockups([]);
    setShowMockups(true);
    try {
      await onGenerateMockup(imageUrl, (imgs) => setAiMockups([...imgs]));
    } catch (e) {
      alert("Tạo mockup thất bại. Đảm bảo extension Flow đang bật.");
    } finally {
      setIsMockuping(false);
    }
  };
  const [activeSubTab, setActiveSubTab] = useState<'colors' | 'ropes' | 'parts' | 'split'>('colors');
  const [customInstruction, setCustomInstruction] = useState('');
  const [customName, setCustomName] = useState('');
  const [designBase64, setDesignBase64] = useState<string>('');
  const [transparentDesign, setTransparentDesign] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [storeGroups, setStoreGroups] = useState<StoreGroup[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Mockup Preview State
  const [selectedMockup, setSelectedMockup] = useState<MockupItem | null>(null);
  const [designScale, setDesignScale] = useState(40); 
  const [designPos, setDesignPos] = useState({ x: 50, y: 35 }); 
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, startPosX: number, startPosY: number } | null>(null);
  const mockupContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && imageUrl) {
        setDesignBase64(imageUrl);
        fetchMockups();
        if (isTShirtMode) {
            handlePrepareTransparent();
        }
    }
  }, [isOpen, imageUrl, isTShirtMode]);

  const handlePrepareTransparent = async () => {
      setIsProcessing(true);
      const res = await applyAlphaFilter(imageUrl);
      setTransparentDesign(res);
      setIsProcessing(false);
  };

  const fetchMockups = async () => {
      setLoadingMockups(true);
      try {
          const res = await getMockupsFromSheet();
          if (res.status === 'success' && res.data) {
              const groups: Record<string, MockupItem[]> = {};
              res.data.forEach((m: any) => {
                  if (!groups[m.storeName]) groups[m.storeName] = [];
                  groups[m.storeName].push(m);
              });
              const storeList = Object.entries(groups).map(([name, items]) => ({ storeName: name, mockups: items }));
              setStoreGroups(storeList);
              if (storeList.length > 0) setSelectedStore(storeList[0].storeName);
          }
      } finally { setLoadingMockups(false); }
  };

  const handleRemixAction = async (instr: string) => {
    if (!instr.trim()) return;
    setIsProcessing(true);
    try {
        await onRemix(instr);
    } finally { setIsProcessing(false); }
  };

  const downloadDesign = async (transparent: boolean) => {
    setIsDownloading(true);
    setShowDownloadMenu(false);
    try {
        let source = imageUrl;
        if (imageUrl.startsWith('http')) {
            try { source = await getImageBase64(imageUrl); } catch (e) {}
        }
        const cleanedImageOnWhite = isTShirtMode ? source : await cleanupProductImage(source);
        const finalSrc = transparent ? await applyAlphaFilter(cleanedImageOnWhite) : cleanedImageOnWhite;
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = finalSrc;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 2500; canvas.height = 2500;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            if (!transparent) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 2500, 2500); }
            const scale = Math.min(2500 / img.width, 2500 / img.height);
            const w = img.width * scale; const h = img.height * scale;
            ctx.drawImage(img, (2500 - w) / 2, (2500 - h) / 2, w, h);
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png', 1.0);
            link.download = transparent ? 'design-transparent.png' : 'design-hq.png';
            link.click();
            setIsDownloading(false);
        };
    } catch (error) {
        setIsDownloading(false);
        alert("Lỗi tải xuống.");
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startPosX: designPos.x,
          startPosY: designPos.y
      };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging || !dragRef.current || !mockupContainerRef.current) return;
      
      const rect = mockupContainerRef.current.getBoundingClientRect();
      // Tính toán sự thay đổi dựa trên kích thước THỰC TẾ của khung chứa ảnh mockup
      const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
      
      setDesignPos({
          x: Math.max(0, Math.min(100, dragRef.current.startPosX + dx)),
          y: Math.max(0, Math.min(100, dragRef.current.startPosY + dy))
      });
  };

  const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
      if (selectedMockup) {
          const delta = e.deltaY > 0 ? -2 : 2;
          setDesignScale(prev => Math.max(5, Math.min(300, prev + delta)));
      }
  };

  const handleDownloadAndSaveResult = async () => {
      if (!selectedMockup || !transparentDesign) return;
      setIsSavingResult(true);
      
      try {
          // CORS FIX: Bắt buộc lấy Base64 của ảnh Mockup từ Server để tránh lỗi Tainted Canvas (Unknown error)
          let mockupBase64 = selectedMockup.url;
          if (selectedMockup.url.startsWith('http')) {
              try {
                  const proxyRes = await getImageBase64(selectedMockup.url);
                  mockupBase64 = proxyRes;
              } catch (proxyError) {
                  console.error("CORS Proxy failed for mockup", proxyError);
                  throw new Error("Không thể tải ảnh mockup do lỗi bảo mật (CORS).");
              }
          }

          const resultBase64 = await new Promise<string>((resolve, reject) => {
              const canvas = document.createElement('canvas');
              const mockupImg = new Image();
              mockupImg.crossOrigin = "anonymous";
              mockupImg.src = mockupBase64;
              
              mockupImg.onload = async () => {
                  canvas.width = mockupImg.width;
                  canvas.height = mockupImg.height;
                  const ctx = canvas.getContext('2d', { alpha: false });
                  if (!ctx) { reject("Canvas context error"); return; }
                  
                  // Vẽ nền mockup
                  ctx.drawImage(mockupImg, 0, 0);
                  
                  const designImg = new Image();
                  designImg.src = transparentDesign;
                  
                  designImg.onload = () => {
                      // ĐỒNG BỘ TỈ LỆ: Design trong UI chiếm 40% chiều rộng của mockup khi scale = 100%
                      const scaleFactor = designScale / 100;
                      const dWidth = canvas.width * 0.4 * scaleFactor;
                      const dHeight = (designImg.height / designImg.width) * dWidth;
                      
                      // ĐỒNG BỘ TỌA ĐỘ: designPos.x/y là tâm của thiết kế trong UI (do transform: translate(-50%,-50%))
                      const centerX = (canvas.width * designPos.x) / 100;
                      const centerY = (canvas.height * designPos.y) / 100;
                      
                      const dx = centerX - (dWidth / 2);
                      const dy = centerY - (dHeight / 2);
                      
                      ctx.drawImage(designImg, dx, dy, dWidth, dHeight);
                      resolve(canvas.toDataURL('image/png', 0.95)); 
                  };
                  designImg.onerror = () => reject("Lỗi tải thiết kế tạm thời.");
              };
              mockupImg.onerror = () => reject("Lỗi bảo mật khi truy cập ảnh Mockup từ Drive.");
          });

          // 1. Tải xuống ngay lập tức
          const link = document.createElement('a');
          link.href = resultBase64;
          link.download = `Mockup_${selectedMockup.name.split('.')[0]}_Result.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // 2. Tự động lưu lên Backend Cloud
          const username = localStorage.getItem('app_username') || 'Unknown';
          await saveFinalMockupResult(username, `Mockup_${selectedMockup.name}`, resultBase64);
          
      } catch (e: any) {
          alert("Lỗi: " + (e.message || "Unknown error (CORS Issue)"));
      } finally {
          setIsSavingResult(false);
      }
  };

  const currentStoreMockups = storeGroups.find(g => g.storeName === selectedStore)?.mockups || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-slate-900 rounded-2xl w-full max-w-7xl h-[92vh] flex flex-col border border-slate-800 shadow-2xl overflow-hidden">
          
          {/* Main Modal Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950">
            <h3 className="text-lg font-bold text-slate-200 flex items-center">
                {isTShirtMode ? <Zap className="w-5 h-5 mr-2 text-purple-500" /> : <Sparkles className="w-5 h-5 mr-2 text-indigo-500" />}
                {isTShirtMode ? 'Thiết kế & Alpha Transparency (High Resolution Mode)' : 'Design Detail & Remix'}
            </h3>
            <div className="flex items-center space-x-3">
              {!selectedMockup && (
                <>
                  {onUndo && (
                    <button
                      onClick={onUndo}
                      disabled={!canUndo || isRemixing}
                      className="flex items-center space-x-2 px-4 py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title="Hoàn tác chỉnh sửa gần nhất"
                    >
                      <RotateCcw size={14} />
                      <span>Hoàn tác</span>
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                      className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 transition-all"
                    >
                      {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      <span>Tải HQ</span>
                      <ChevronDown size={14} className={`transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showDownloadMenu && (
                      <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl overflow-hidden animate-fade-in z-40">
                        <button onClick={() => downloadDesign(false)} className="w-full flex items-center px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors border-b border-slate-700">
                          <div className="w-4 h-4 bg-white rounded-sm mr-3" /> Nền Trắng (Mặc định)
                        </button>
                        <button onClick={() => downloadDesign(true)} className="w-full flex items-center px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors">
                          <div className="w-4 h-4 bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc)] bg-[length:4px_4px] rounded-sm mr-3" /> Trong Suốt (Alpha)
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAiMockup}
                    disabled={isMockuping}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-500 disabled:opacity-60 transition-all"
                    title="Ghép thiết kế vào mockup sản phẩm thật"
                  >
                    {isMockuping ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                    <span>{isMockuping ? 'Đang tạo...' : 'Tạo Mockup'}</span>
                  </button>
                </>
              )}
              <button className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white"><RefreshCw size={16} /></button>
              <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors"><X size={24} /></button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            
            {/* Left: Main Area (Design View) */}
            <div className="flex-1 bg-slate-950 relative flex items-center justify-center p-12 overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:24px_24px] bg-[position:0_0,12px:12px] opacity-10" />
                
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                    {isProcessing || isRemixing ? (
                        <div className="flex flex-col items-center">
                            <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Processing Design...</p>
                        </div>
                    ) : (
                        <div className="relative group">
                            <img 
                                src={isTShirtMode ? (transparentDesign || imageUrl) : imageUrl} 
                                alt="Main Design" 
                                className="max-w-full max-h-[72vh] object-contain drop-shadow-2xl" 
                            />
                            
                            {/* OVERLAY: Mockup Preview Display */}
                            {selectedMockup && (
                                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617] animate-fade-in p-6">
                                    <div className="relative w-full h-full max-w-6xl bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 flex flex-col shadow-2xl">
                                        
                                        {/* Preview Header */}
                                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-[#0f172a]">
                                            <div className="flex items-center">
                                                <div className="bg-indigo-900/40 p-2.5 rounded-xl mr-4">
                                                    <Monitor className="text-indigo-400" size={22} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[14px] font-bold text-slate-100 tracking-tight block uppercase">
                                                        PREVIEW ON FILE - {selectedMockup.name.replace(/\.[^/.]+$/, "") || "MOCKUP"}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.15em]">
                                                        {selectedStore || 'STORE'} COLLECTION
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center space-x-4">
                                                <div className="flex items-center space-x-1 bg-slate-800/80 p-1 rounded-2xl border border-slate-700/50">
                                                    {[20, 40, 60, 80, 100].map(val => (
                                                        <button 
                                                            key={val}
                                                            onClick={() => setDesignScale(val)}
                                                            className={`px-4 py-1.5 rounded-xl text-[11px] font-black transition-all ${designScale === val ? 'bg-indigo-600 text-white shadow-md scale-[1.05]' : 'text-slate-400 hover:text-slate-200'}`}
                                                        >
                                                            {val}%
                                                        </button>
                                                    ))}
                                                </div>
                                                
                                                <div className="flex items-center space-x-2">
                                                    <div className="flex items-center bg-slate-800 rounded-xl px-3 py-1.5 border border-slate-700">
                                                        <Sliders size={14} className="text-slate-500 mr-2" />
                                                        <input 
                                                            type="range" min="5" max="250" value={designScale} 
                                                            onChange={(e) => setDesignScale(Number(e.target.value))}
                                                            className="w-20 h-1.5 accent-indigo-500 cursor-pointer"
                                                        />
                                                    </div>
                                                    
                                                    <button 
                                                        onClick={handleDownloadAndSaveResult} 
                                                        disabled={isSavingResult}
                                                        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black hover:bg-indigo-500 flex items-center shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        {isSavingResult ? <Loader2 size={16} className="animate-spin mr-2" /> : <FileDown size={16} className="mr-2" />}
                                                        TẢI VỀ & LƯU HQ
                                                    </button>

                                                    <button 
                                                        onClick={() => setSelectedMockup(null)} 
                                                        className="text-slate-500 hover:text-white p-2 hover:bg-slate-800 rounded-full transition-colors ml-2"
                                                    >
                                                        <X size={28} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Preview Work Area */}
                                        <div 
                                            ref={mockupContainerRef}
                                            className="flex-1 relative bg-[#020617] flex items-center justify-center overflow-hidden cursor-crosshair select-none"
                                            onWheel={handleWheelZoom}
                                        >
                                             <img src={selectedMockup.url} alt="Mockup BG" className="w-full h-full object-contain pointer-events-none select-none drop-shadow-xl" />
                                             <div 
                                                onMouseDown={handleMouseDown}
                                                className={`absolute transition-transform duration-75 flex items-center justify-center cursor-move group/drag ${isDragging ? 'scale-[1.02]' : ''}`}
                                                style={{ 
                                                    width: `${40 * (designScale / 100)}%`, 
                                                    top: `${designPos.y}%`,
                                                    left: `${designPos.x}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    pointerEvents: 'auto'
                                                }}
                                             >
                                                <img 
                                                    src={transparentDesign || imageUrl} 
                                                    className="w-full h-full object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.6)] select-none pointer-events-none" 
                                                />
                                                <div className="absolute inset-0 border-2 border-indigo-500/0 group-hover/drag:border-indigo-500/40 rounded-lg transition-colors" />
                                             </div>
                                             
                                             <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[10px] text-slate-400 pointer-events-none flex items-center space-x-2">
                                                 <Hand size={12} className="text-indigo-400" />
                                                 <span className="font-bold uppercase tracking-wider">Kéo để di chuyển • Cuộn chuột để phóng to • Tải về để sang mẫu khác</span>
                                             </div>
                                        </div>

                                        {/* Mockup Switcher Footer */}
                                        <div className="relative p-6 bg-[#0f172a] border-t border-slate-800 flex items-center">
                                            
                                            <div className="pr-6 flex flex-col justify-center min-w-[200px] border-r border-slate-800 mr-4">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Đổi Store:</span>
                                                <select 
                                                    value={selectedStore || ''} 
                                                    onChange={(e) => setSelectedStore(e.target.value)}
                                                    className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-black rounded-lg p-2 outline-none uppercase cursor-pointer"
                                                >
                                                    {storeGroups.map(g => (
                                                        <option key={g.storeName} value={g.storeName}>{g.storeName}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="flex-1 flex space-x-4 overflow-x-auto pb-2 px-2 scrollbar-thin scrollbar-thumb-slate-700/50">
                                                {currentStoreMockups.map((m, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => { setSelectedMockup(m); setDesignPos({ x: 50, y: 35 }); }}
                                                        className={`flex-shrink-0 w-20 h-24 rounded-2xl overflow-hidden border-2 transition-all relative group ${selectedMockup.url === m.url ? 'border-purple-600 scale-110 shadow-[0_0_20px_rgba(147,51,234,0.4)]' : 'border-slate-800 opacity-50 hover:opacity-100 hover:border-slate-600'}`}
                                                    >
                                                        <img src={m.url} className="w-full h-full object-cover" />
                                                        {selectedMockup.url === m.url && (
                                                            <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center backdrop-blur-[1px]">
                                                                <div className="bg-purple-600 text-white p-1 rounded-full shadow-lg">
                                                                    <CheckCircle2 size={16} />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                            
                                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50">
                                                <div className="h-full bg-indigo-600/30 w-full" />
                                            </div>
                                        </div>

                                        {/* Syncing State */}
                                        {isSavingResult && (
                                            <div className="absolute inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
                                                <div className="bg-slate-900 px-8 py-5 rounded-2xl border border-slate-800 flex items-center shadow-2xl">
                                                    <Loader2 className="animate-spin text-indigo-500 mr-4" size={24} />
                                                    <span className="text-white text-xs font-black uppercase tracking-widest">Đang tải & Đồng bộ lên Cloud...</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* AI Mockups Grid (6 hình) — nền đục, không lòi mẫu gốc phía sau */}
                {showMockups && (
                    <div className="absolute inset-0 z-30 bg-slate-950 flex flex-col animate-fade-in">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#0f172a]">
                            <h4 className="text-sm font-bold text-slate-100 flex items-center">
                                <ImageIcon size={16} className="mr-2 text-purple-400" />
                                Mockup sản phẩm ({aiMockups.length}/{MOCKUP_COUNT})
                                {isMockuping && <Loader2 size={14} className="animate-spin ml-3 text-purple-400" />}
                            </h4>
                            <button onClick={() => setShowMockups(false)} className="px-5 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700">Đóng</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                                {Array(MOCKUP_COUNT).fill(0).map((_, i) => {
                                    const m = aiMockups[i];
                                    if (m) return (
                                        <div key={i} onClick={() => setLightboxIndex(i)} className="group relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900 animate-fade-in cursor-zoom-in aspect-square">
                                            <img src={m} alt={`Mockup ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                            </div>
                                            <a href={m} download={`mockup-${i + 1}.png`} onClick={(e) => e.stopPropagation()} className="absolute bottom-2 right-2 flex items-center gap-1 px-3 py-1.5 bg-indigo-600/90 text-white rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-500">
                                                <Download size={12} /> Tải
                                            </a>
                                        </div>
                                    );
                                    if (isMockuping) return (
                                        <div key={i} className="aspect-square rounded-xl bg-slate-900 border border-slate-800 animate-pulse flex items-center justify-center">
                                            <ImageIcon className="text-slate-700 w-8 h-8" />
                                        </div>
                                    );
                                    return null;
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Lightbox phóng to mockup + nút chuyển qua lại */}
                {lightboxIndex !== null && aiMockups[lightboxIndex] && (
                    <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center p-6 animate-fade-in" onClick={() => setLightboxIndex(null)}>
                        <button onClick={() => setLightboxIndex(null)} className="absolute top-5 right-6 text-slate-300 hover:text-white p-2"><X size={28} /></button>
                        <span className="absolute top-6 left-6 text-slate-300 text-sm font-bold">{lightboxIndex + 1} / {aiMockups.length}</span>

                        <button onClick={(e) => { e.stopPropagation(); lightboxPrev(); }} className="absolute left-4 md:left-10 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-indigo-600 text-white p-3 rounded-full transition-colors"><ChevronLeft size={28} /></button>
                        <img src={aiMockups[lightboxIndex]} alt="Mockup" className="max-h-[82vh] max-w-[80vw] object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
                        <button onClick={(e) => { e.stopPropagation(); lightboxNext(); }} className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 bg-slate-800/80 hover:bg-indigo-600 text-white p-3 rounded-full transition-colors"><ChevronRight size={28} /></button>

                        <a href={aiMockups[lightboxIndex]} download={`mockup-${lightboxIndex + 1}.png`} onClick={(e) => e.stopPropagation()} className="mt-5 flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-500">
                            <Download size={18} /> Tải hình này
                        </a>
                    </div>
                )}
            </div>

            {/* Right: Sidebar Panel */}
            <div className="w-[420px] bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-800 bg-slate-950">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center">
                        <Monitor size={14} className="mr-2 text-purple-500" />
                        {isTShirtMode ? 'Mockup Library' : 'Toolbox Panel'}
                    </h4>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-800">
                    {isTShirtMode ? (
                        <div className="space-y-6">
                            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-hide">
                                {storeGroups.map(group => (
                                    <button 
                                        key={group.storeName}
                                        onClick={() => setSelectedStore(group.storeName)}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${selectedStore === group.storeName ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {group.storeName}
                                    </button>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {loadingMockups ? (
                                    Array(6).fill(0).map((_, i) => <div key={i} className="aspect-[3/4] bg-slate-800 rounded-xl animate-pulse" />)
                                ) : (
                                    storeGroups.find(g => g.storeName === selectedStore)?.mockups.map((m, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={() => { setSelectedMockup(m); setDesignPos({ x: 50, y: 35 }); }}
                                            className="group relative aspect-[3/4] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 hover:border-purple-500 transition-all cursor-pointer shadow-lg"
                                        >
                                            <img src={m.url} alt={m.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                                <span className="text-[10px] text-white font-bold uppercase">Apply Design</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 pb-2 border-b border-slate-800">
                                <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center"><Wand2 size={12} className="mr-2" /> Đổi tên cá nhân hoá</h4>
                                <p className="text-[11px] text-slate-500 leading-relaxed">Nhập tên muốn hiển thị trên thiết kế (giữ nguyên font & vị trí, chỉ thay tên).</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={customName}
                                        onChange={(e) => setCustomName(e.target.value)}
                                        placeholder="VD: Olivia, James & Bun..."
                                        className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-slate-600"
                                        onKeyDown={(e) => { if (e.key === 'Enter' && customName.trim() && !isRemixing) handleRemixAction(`Edit the design: change ONLY the PERSON\'S NAME text (the proper name line, usually the largest name near the bottom) to "${customName.trim()}". CRITICAL: keep ALL other text (the quote, the year, any other words), the fonts, colors, flowers, border and layout EXACTLY the same — do not remove or alter anything except that one name.`); }}
                                    />
                                    <button
                                        disabled={!customName.trim() || isRemixing}
                                        onClick={() => handleRemixAction(`Edit the design: change ONLY the PERSON\'S NAME text (the proper name line, usually the largest name near the bottom) to "${customName.trim()}". CRITICAL: keep ALL other text (the quote, the year, any other words), the fonts, colors, flowers, border and layout EXACTLY the same — do not remove or alter anything except that one name.`)}
                                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                    >
                                        {isRemixing ? <Loader2 size={14} className="animate-spin" /> : 'Áp dụng'}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Remix Custom Instruction</h4>
                                <div className="relative">
                                    <textarea 
                                        value={customInstruction}
                                        onChange={(e) => setCustomInstruction(e.target.value)}
                                        placeholder="Enter instructions to modify design..."
                                        className="w-full h-28 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 focus:border-indigo-500 outline-none resize-none"
                                    />
                                    <button 
                                        onClick={() => handleRemixAction(customInstruction)}
                                        disabled={isProcessing || !customInstruction.trim()}
                                        className="absolute bottom-3 right-3 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
                                    >
                                        <Sparkles size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex border-b border-slate-800">
                                    <button onClick={() => setActiveSubTab('colors')} className={`flex-1 pb-3 text-[10px] font-bold uppercase tracking-widest ${activeSubTab === 'colors' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'}`}>Colors</button>
                                    <button onClick={() => setActiveSubTab('ropes')} className={`flex-1 pb-3 text-[10px] font-bold uppercase tracking-widest ${activeSubTab === 'ropes' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'}`}>Ropes</button>
                                    <button onClick={() => setActiveSubTab('split')} className={`flex-1 pb-3 text-[10px] font-bold uppercase tracking-widest ${activeSubTab === 'split' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'}`}>Split</button>
                                </div>
                                <div className="min-h-[150px]">
                                    {activeSubTab === 'colors' && (
                                        <div className="grid grid-cols-2 gap-2">
                                            {COLOR_OPTIONS.map((c) => (
                                                <button key={c.name} onClick={() => handleRemixAction(`Change color to ${c.name}`)} className="flex items-center p-2 bg-slate-950 border border-slate-800 rounded-lg hover:border-indigo-500">
                                                    <div className="w-4 h-4 rounded-full mr-2" style={{ background: c.color }} />
                                                    <span className="text-[10px] text-slate-400">{c.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {activeSubTab === 'ropes' && (
                                        <div className="grid grid-cols-1 gap-2">
                                            {ROPE_OPTIONS.map((r) => (
                                                <button key={r.id} onClick={() => handleRemixAction(`Add loop of ${r.name}`)} className="flex items-center p-2 bg-slate-950 border border-slate-800 rounded-lg hover:border-indigo-500 text-left">
                                                    <div className="w-6 h-2 rounded-sm mr-3" style={{ background: r.color }} />
                                                    <span className="text-[10px] text-slate-400">{r.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {activeSubTab === 'split' && (
                                        <div className="text-center py-6">
                                            <button onClick={onSplit} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase">Start Splitting Characters</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                <div className="p-6 border-t border-slate-800 bg-slate-950">
                    <p className="text-[10px] text-slate-600 text-center font-bold uppercase tracking-widest">Professional Creative Studio Engine</p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
