import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Type, Plus, Trash2, Download, ScanText, Loader2, Bold, Italic } from 'lucide-react';
import { getImageBase64 } from '../services/googleSheetService';

/**
 * Trình sửa chữ KHÔNG dùng AI:
 * - Render chữ bằng FONT THẬT (web font) -> đúng font 100%, sửa trực tiếp.
 * - OCR (Tesseract.js) tự dò chữ trên ảnh -> tạo sẵn layer ở đúng vị trí (có phủ nền che chữ cũ).
 * - Xuất PNG ở độ phân giải gốc.
 */

const FONTS = [
  'Dancing Script', 'Great Vibes', 'Pacifico', 'Playfair Display', 'Lora', 'Montserrat', 'Poppins', 'Arial',
];

interface TextLayer {
  id: string;
  text: string;
  xPct: number;        // vị trí trái (% so với ảnh)
  yPct: number;        // vị trí trên (%)
  fontSizePct: number; // cỡ chữ (% chiều cao ảnh)
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  bgOn: boolean;       // phủ nền che chữ cũ
  bgColor: string;
}

let _id = 0;
const newId = () => `tl_${Date.now()}_${_id++}`;

interface Props {
  imageUrl: string;
  onClose: () => void;
}

export const TextLayerEditor: React.FC<Props> = ({ imageUrl, onClose }) => {
  const [src, setSrc] = useState<string>(imageUrl);
  const [layers, setLayers] = useState<TextLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dispH, setDispH] = useState(0);
  const [isOcr, setIsOcr] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Lấy base64 nếu là URL http (tránh tainted canvas khi export)
  useEffect(() => {
    let active = true;
    (async () => {
      if (imageUrl.startsWith('http')) {
        try { const b64 = await getImageBase64(imageUrl); if (active && b64) setSrc(b64); } catch { /* ignore */ }
      } else setSrc(imageUrl);
    })();
    return () => { active = false; };
  }, [imageUrl]);

  // Đo chiều cao hiển thị của ảnh để quy đổi cỡ chữ
  useEffect(() => {
    const measure = () => { if (imgRef.current) setDispH(imgRef.current.clientHeight); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [src]);

  const selected = layers.find(l => l.id === selectedId) || null;
  const update = (id: string, patch: Partial<TextLayer>) =>
    setLayers(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));

  const addLayer = () => {
    const l: TextLayer = {
      id: newId(), text: 'Tên của bạn', xPct: 30, yPct: 45, fontSizePct: 8,
      fontFamily: 'Dancing Script', color: '#1e293b', bold: false, italic: false, bgOn: false, bgColor: '#ffffff',
    };
    setLayers(ls => [...ls, l]); setSelectedId(l.id);
  };

  // Kéo di chuyển layer
  const onPointerDown = (e: React.PointerEvent, l: TextLayer) => {
    e.stopPropagation();
    setSelectedId(l.id);
    dragRef.current = { id: l.id, startX: e.clientX, startY: e.clientY, ox: l.xPct, oy: l.yPct };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / r.width) * 100;
    const dy = ((e.clientY - d.startY) / r.height) * 100;
    update(d.id, { xPct: Math.max(0, Math.min(98, d.ox + dx)), yPct: Math.max(0, Math.min(98, d.oy + dy)) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  // OCR tự dò chữ -> tạo layer + phủ nền che chữ cũ
  const runOcr = async () => {
    setIsOcr(true);
    try {
      const Tesseract: any = await import('tesseract.js');
      const { data } = await Tesseract.recognize(src, 'eng');
      const w = natural.w || 1000, h = natural.h || 1000;
      const lines = (data.lines || []).filter((ln: any) => (ln.text || '').trim().length > 0);
      const detected: TextLayer[] = lines.map((ln: any) => {
        const b = ln.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
        return {
          id: newId(),
          text: (ln.text || '').trim(),
          xPct: (b.x0 / w) * 100,
          yPct: (b.y0 / h) * 100,
          fontSizePct: Math.max(2, ((b.y1 - b.y0) / h) * 100),
          fontFamily: 'Playfair Display',
          color: '#1e293b',
          bold: false, italic: false,
          bgOn: true, bgColor: '#ffffff', // che chữ cũ
        };
      });
      if (detected.length) { setLayers(ls => [...ls, ...detected]); setSelectedId(detected[0].id); }
      else alert('Không dò thấy chữ nào trong ảnh.');
    } catch (e: any) {
      alert('OCR lỗi: ' + (e?.message || e));
    } finally { setIsOcr(false); }
  };

  // Xuất PNG ở độ phân giải gốc
  const exportPng = useCallback(async () => {
    setIsExporting(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src; });
      const W = img.naturalWidth, H = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      ctx.textBaseline = 'top';
      for (const l of layers) {
        const fs = (l.fontSizePct / 100) * H;
        const x = (l.xPct / 100) * W;
        const y = (l.yPct / 100) * H;
        ctx.font = `${l.italic ? 'italic ' : ''}${l.bold ? '700 ' : '400 '}${fs}px "${l.fontFamily}"`;
        const m = ctx.measureText(l.text);
        if (l.bgOn) {
          const padX = fs * 0.25, padY = fs * 0.15;
          ctx.fillStyle = l.bgColor;
          ctx.fillRect(x - padX, y - padY, m.width + padX * 2, fs + padY * 2);
        }
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, x, y);
      }
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = 'design-personalized.png'; a.click();
    } catch (e: any) {
      alert('Xuất ảnh lỗi: ' + (e?.message || e));
    } finally { setIsExporting(false); }
  }, [src, layers]);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#0f172a]">
        <h3 className="text-sm font-bold text-slate-100 flex items-center"><Type size={16} className="mr-2 text-emerald-400" /> Sửa chữ (font thật · không AI)</h3>
        <div className="flex items-center gap-2">
          <button onClick={addLayer} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700"><Plus size={14} /> Thêm chữ</button>
          <button onClick={runOcr} disabled={isOcr} className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-500 disabled:opacity-60">{isOcr ? <Loader2 size={14} className="animate-spin" /> : <ScanText size={14} />} Tự dò chữ (OCR)</button>
          <button onClick={exportPng} disabled={isExporting} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-500 disabled:opacity-60">{isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Tải PNG</button>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><X size={22} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Canvas vùng ảnh */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-[#020617]" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div className="relative inline-block" onClick={() => setSelectedId(null)}>
            <img
              ref={imgRef}
              src={src}
              alt="design"
              className="max-h-[80vh] max-w-full object-contain select-none"
              draggable={false}
              onLoad={(e) => { const t = e.currentTarget; setNatural({ w: t.naturalWidth, h: t.naturalHeight }); setDispH(t.clientHeight); }}
            />
            {layers.map(l => (
              <div
                key={l.id}
                onPointerDown={(e) => onPointerDown(e, l)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', left: `${l.xPct}%`, top: `${l.yPct}%`,
                  fontFamily: `"${l.fontFamily}"`, fontSize: dispH ? `${(l.fontSizePct / 100) * dispH}px` : '16px',
                  fontWeight: l.bold ? 700 : 400, fontStyle: l.italic ? 'italic' : 'normal',
                  color: l.color, background: l.bgOn ? l.bgColor : 'transparent',
                  padding: l.bgOn ? '0.05em 0.2em' : 0, lineHeight: 1, whiteSpace: 'pre',
                  cursor: 'move', userSelect: 'none', touchAction: 'none',
                  outline: selectedId === l.id ? '2px dashed #6366f1' : 'none',
                }}
              >{l.text || ' '}</div>
            ))}
          </div>
        </div>

        {/* Panel điều khiển layer */}
        <div className="w-[320px] bg-slate-900 border-l border-slate-800 overflow-y-auto p-5 space-y-5">
          {!selected ? (
            <p className="text-sm text-slate-500 leading-relaxed">Bấm <b>Thêm chữ</b> hoặc <b>Tự dò chữ (OCR)</b> để tạo lớp chữ. Chọn 1 lớp để chỉnh font/cỡ/màu, kéo trên ảnh để di chuyển.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase">Lớp chữ</h4>
                <button onClick={() => { setLayers(ls => ls.filter(x => x.id !== selected.id)); setSelectedId(null); }} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
              </div>
              <textarea value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} rows={2}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-sm resize-none focus:ring-2 focus:ring-emerald-500" />
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Font</label>
                <select value={selected.fontFamily} onChange={(e) => update(selected.id, { fontFamily: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 text-sm" style={{ fontFamily: `"${selected.fontFamily}"` }}>
                  {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Cỡ chữ ({selected.fontSizePct.toFixed(1)}%)</label>
                <input type="range" min={2} max={25} step={0.5} value={selected.fontSizePct} onChange={(e) => update(selected.id, { fontSizePct: Number(e.target.value) })} className="w-full accent-emerald-500" />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Màu chữ</label>
                  <input type="color" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value })} className="w-full h-9 bg-slate-950 border border-slate-700 rounded cursor-pointer" />
                </div>
                <button onClick={() => update(selected.id, { bold: !selected.bold })} className={`mt-4 p-2 rounded ${selected.bold ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Bold size={16} /></button>
                <button onClick={() => update(selected.id, { italic: !selected.italic })} className={`mt-4 p-2 rounded ${selected.italic ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Italic size={16} /></button>
              </div>
              <div className="border-t border-slate-800 pt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={selected.bgOn} onChange={(e) => update(selected.id, { bgOn: e.target.checked })} className="accent-emerald-500" />
                  Phủ nền (che chữ cũ bên dưới)
                </label>
                {selected.bgOn && (
                  <input type="color" value={selected.bgColor} onChange={(e) => update(selected.id, { bgColor: e.target.value })} className="w-full h-9 bg-slate-950 border border-slate-700 rounded cursor-pointer" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
