
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { ResultsPanel } from './components/ResultsPanel';
import { HistorySidebar } from './components/HistorySidebar';
import { AdminDashboard } from './components/AdminDashboard'; 
import { RedesignDetailModal } from './components/RedesignDetailModal';
import { DesignAnalysisModal } from './components/DesignAnalysisModal';
import { TshirtPromptModal } from './components/TshirtPromptModal';
import { LoginScreen } from './components/LoginScreen'; 
import { cleanupProductImage as cleanTshirt, analyzeProductDesign as analyzeTshirt, generateProductRedesigns as generateTshirt } from './services/geminiService';
import { cleanupProductImage as cleanPod, analyzeProductDesign as analyzePod, generateProductRedesigns as generatePod, extractDesignElements, remixProductImage as remixPod, detectAndSplitCharacters as splitPod, generateProductMockups } from './services/geminiPodService';
import { sendDataToSheet, logoutUser, getDesignsFromSheet, updateDesignInSheet, deleteDesignFromSheet, getImageBase64 } from './services/googleSheetService'; 
import { ProductAnalysis, ProcessStage, PRODUCT_TYPES, HistoryItem, DesignMode, RopeType, AppTab, RetentionLevel } from './types';
import { RefreshCw, Package, Shirt, LayoutGrid, LogOut, Settings, Target, Wand2, AlertTriangle } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [permissions, setPermissions] = useState<string>('POD'); 
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.POD);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [extractedElements, setExtractedElements] = useState<string[] | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [generatedRedesigns, setRedesigns] = useState<string[] | null>(null);
  const [stage, setStage] = useState<ProcessStage>(ProcessStage.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [productType, setProductType] = useState<string>(PRODUCT_TYPES[0]);
  const [designMode, setDesignMode] = useState<DesignMode>(DesignMode.NEW_CONCEPT);
  const [retention, setRetention] = useState<RetentionLevel>('40%');
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [isTshirtPromptModalOpen, setIsTshirtPromptModalOpen] = useState(false);
  const [selectedRedesignIndex, setSelectedRedesignIndex] = useState<number | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false); 
  const [prevRedesigns, setPrevRedesigns] = useState<string[] | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('app_username');
    const storedPerms = localStorage.getItem('app_permissions');
    if (storedUser) {
      setUsername(storedUser);
      setIsAuthenticated(true);
      const perm = storedPerms || 'POD';
      setPermissions(perm);
      if (perm === 'TSHIRT') setActiveTab(AppTab.TSHIRT);
    }
    setIsLoadingAuth(false);
  }, []);

  const fetchCloudHistory = useCallback(async () => {
    if (!username) return;
    setIsLoadingHistory(true);
    try {
      const isAdmin = permissions === 'ADMIN' || username.trim().toLowerCase() === 'admin';
      const res = await getDesignsFromSheet(username, isAdmin);
      if (res.status === 'success' && res.data) {
        const cloudItems: HistoryItem[] = res.data.map((d: any) => ({
          id: d.id,
          timestamp: d.timestamp ? new Date(d.timestamp).getTime() : Date.now(),
          originalImage: d.images[0] || '', 
          processedImage: d.images[0] || null,
          analysis: { 
            description: d.description, 
            redesignPrompt: d.prompt, 
            designCritique: d.description, 
            detectedComponents: [] 
          },
          generatedRedesigns: d.images,
          productType: d.productType,
          designMode: d.designMode as DesignMode || DesignMode.NEW_CONCEPT,
          tab: d.tab === 'TSHIRT' ? AppTab.TSHIRT : AppTab.POD,
          username: d.username,
          retention: d.similarity,
          ropeType: d.ropeType as RopeType || RopeType.NONE
        }));
        setHistory(cloudItems);
      }
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [username, permissions]);

  useEffect(() => {
    if (isHistoryOpen) fetchCloudHistory();
  }, [isHistoryOpen, fetchCloudHistory]);

  const handleDeleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Xóa thiết kế này khỏi Cloud?")) return;
    try {
      const isAdmin = permissions === 'ADMIN' || username.trim().toLowerCase() === 'admin';
      const res = await deleteDesignFromSheet(username, id, isAdmin);
      if (res.status === 'success') {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch (e) { alert("Lỗi kết nối."); }
  };

  const processFile = (file: File) => {
    setStage(ProcessStage.UPLOADING);
    setError(null); setProcessedImage(null); setAnalysis(null); setRedesigns(null); setExtractedElements(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setOriginalImage(base64);
      startWorkflow(base64);
    };
    reader.readAsDataURL(file);
  };

  const startWorkflow = async (image: string) => {
    // Reset MỌI kết quả cũ để không hiển thị thiết kế của sản phẩm trước.
    setRedesigns(null);
    setCurrentDesignId(null);
    setExtractedElements(null);
    setSelectedRedesignIndex(null);
    try {
      if (activeTab === AppTab.POD) {
        setStage(ProcessStage.CLEANING);
        const cleaned = await cleanPod(image);
        setProcessedImage(cleaned);
        
        // Cooldown 2s giữa 2 bước để không làm cháy RPM của tài khoản trả phí
        await new Promise(r => setTimeout(r, 2000));
        
        setStage(ProcessStage.ANALYZING);
        const analysisResult = await analyzePod(image, productType, designMode);
        setAnalysis(analysisResult);
        
        try {
          const frames = await extractDesignElements(image);
          setExtractedElements(frames);
        } catch (fErr) { console.warn("Frame extraction failed, continuing..."); }
        
        setStage(ProcessStage.REVIEW);
        setIsCustomizeModalOpen(true);
      } else {
        setStage(ProcessStage.CLEANING);
        const cleaned = await cleanTshirt(image);
        setProcessedImage(cleaned);
        
        await new Promise(r => setTimeout(r, 2000));
        
        setStage(ProcessStage.ANALYZING); 
        const analysisResult = await analyzeTshirt(image, "T-Shirt", designMode, AppTab.TSHIRT, retention);
        setAnalysis(analysisResult);
        
        setStage(ProcessStage.REVIEW);
        setIsTshirtPromptModalOpen(true);
      }
    } catch (err: any) { 
      console.error("Workflow error:", err);
      let errorMsg = err.message || "Lỗi hệ thống.";
      
      const str = JSON.stringify(err).toLowerCase();
      if (str.includes("quota") || str.includes("429")) {
          errorMsg = "LỖI QUOTA: Ngay cả tài khoản TRẢ PHÍ cũng có hạn mức. Hãy vào Google Cloud Console nâng Quota 'Requests Per Minute', hoặc thêm nhiều Key vào Panel.";
      }

      if (processedImage && stage !== ProcessStage.CLEANING) {
        setStage(ProcessStage.REVIEW);
        if (activeTab === AppTab.POD) setIsCustomizeModalOpen(true);
        else setIsTshirtPromptModalOpen(true);
      } else {
        setError(errorMsg); 
        setStage(ProcessStage.IDLE);
      }
    }
  };

  const handleTshirtGenerate = async (userAddition: string) => {
    setIsTshirtPromptModalOpen(false);
    if (!analysis || !originalImage) return;
    try {
      setStage(ProcessStage.GENERATING);
      setRedesigns(null);
      const redesigns = await generateTshirt(analysis.redesignPrompt, RopeType.NONE, [], userAddition, "T-Shirt", false, AppTab.TSHIRT, originalImage, retention, (imgs) => setRedesigns([...imgs]));
      setRedesigns(redesigns);
      setStage(ProcessStage.COMPLETE);
      
      const combinedPromptForLog = `Base: ${analysis.redesignPrompt} | User Suggestion: ${userAddition}`;
      const res = await sendDataToSheet(redesigns, combinedPromptForLog, analysis.description, username, "T-Shirt", `Retention: ${retention}`, 'TSHIRT', designMode);
      if (res.status === 'success') setCurrentDesignId(res.designId);
    } catch (err: any) {
      setError(err.message || "Lỗi tạo mẫu T-Shirt.");
      setStage(ProcessStage.REVIEW);
      setIsTshirtPromptModalOpen(true);
    }
  };

  const handleGenerateFromModal = async (selectedComponents: string[], userNotes: string, ropeType: RopeType) => {
    setIsCustomizeModalOpen(false);
    if (!analysis) return;
    try {
      setStage(ProcessStage.GENERATING);
      setRedesigns(null);
      const effectiveType = (productType === PRODUCT_TYPES[0] && analysis.detectedProductType) ? analysis.detectedProductType : productType;
      const redesigns = await generatePod(analysis.redesignPrompt, ropeType, selectedComponents, userNotes, effectiveType, processedImage || originalImage || undefined, (imgs) => setRedesigns([...imgs]));
      setRedesigns(redesigns);
      setStage(ProcessStage.COMPLETE);
      
      const res = await sendDataToSheet(redesigns, analysis.redesignPrompt, analysis.description, username, productType, `Rope: ${ropeType}`, 'POD', designMode);
      if (res.status === 'success') setCurrentDesignId(res.designId);
    } catch (err: any) { 
      setError(err.message || "Lỗi tạo mẫu."); 
      setStage(ProcessStage.REVIEW); 
      setIsCustomizeModalOpen(true);
    }
  };

  const handleRemix = async (instruction: string) => {
      if (selectedRedesignIndex === null || !generatedRedesigns) return;
      setIsRemixing(true);
      const snapshot = [...generatedRedesigns]; // lưu để Hoàn tác
      try {
          let currentImg = generatedRedesigns[selectedRedesignIndex];
          if (currentImg.startsWith('http')) {
              try { currentImg = await getImageBase64(currentImg); } catch (e) {}
          }
          const newImg = await remixPod(currentImg, instruction);
          const newRedesigns = [...generatedRedesigns];
          newRedesigns[selectedRedesignIndex] = newImg;
          setPrevRedesigns(snapshot);
          setRedesigns(newRedesigns);
          if (currentDesignId) {
             const finalImgForSheet = newImg.startsWith('data:') ? newImg : `data:image/png;base64,${newImg}`;
             await updateDesignInSheet(username, currentDesignId, selectedRedesignIndex, finalImgForSheet);
          }
      } catch (e: any) {
          const msg = e?.message || String(e);
          alert("Remix thất bại: " + msg + "\n\n(Kiểm tra extension Flow đang bật / đã đăng nhập labs.google, hoặc cấu hình Mindesk/BE.)");
      }
      finally { setIsRemixing(false); }
  };

  const handleSplit = async (): Promise<string[]> => {
      if (selectedRedesignIndex === null || !generatedRedesigns) return [];
      try {
          let currentImg = generatedRedesigns[selectedRedesignIndex];
          if (currentImg.startsWith('http')) {
              try { currentImg = await getImageBase64(currentImg); } catch (e) {}
          }
          return await splitPod(currentImg);
      } catch (e) { return []; }
  };

  const handleLoginSuccess = (user: string, perms?: string, systemKey?: string) => {
    setUsername(user); setIsAuthenticated(true);
    localStorage.setItem('app_username', user);
    const finalPerms = perms || 'POD';
    setPermissions(finalPerms);
    localStorage.setItem('app_permissions', finalPerms);
    if (systemKey) localStorage.setItem('app_system_key', systemKey);
    setActiveTab(finalPerms === 'TSHIRT' ? AppTab.TSHIRT : AppTab.POD);
  };

  const handleLogout = () => {
    if (username) logoutUser(username);
    localStorage.removeItem('app_username'); localStorage.removeItem('app_permissions');
    setIsAuthenticated(false); setUsername(''); resetState();
  };

  const resetState = () => { 
    setStage(ProcessStage.IDLE); 
    setOriginalImage(null); 
    setProcessedImage(null); 
    setRedesigns(null); 
    setAnalysis(null); 
    setExtractedElements(null); 
    setError(null); 
    setIsTshirtPromptModalOpen(false);
    setIsCustomizeModalOpen(false);
  };

  const handleLoadHistory = (item: HistoryItem) => {
    setOriginalImage(item.originalImage);
    setProcessedImage(item.processedImage);
    setAnalysis(item.analysis);
    setRedesigns(item.generatedRedesigns);
    setProductType(item.productType);
    setDesignMode(item.designMode || DesignMode.NEW_CONCEPT);
    setActiveTab(item.tab || AppTab.POD);
    setCurrentDesignId(item.id);
    setStage(ProcessStage.COMPLETE); 
    setError(null);
    setIsHistoryOpen(false);
  };

  if (isLoadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-indigo-500"><RefreshCw className="animate-spin" /></div>;
  if (!isAuthenticated) return <LoginScreen onLoginSuccess={handleLoginSuccess} />;

  const isAdmin = permissions === 'ADMIN' || username.trim().toLowerCase() === 'admin';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-x-hidden text-slate-200">
      <Header onHistoryClick={() => setIsHistoryOpen(true)} useUltra={false} />
      
      <div className="bg-slate-900 border-b border-slate-800 py-2 px-4 shadow-sm z-30 relative flex justify-between items-center">
          <div className="flex bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 items-center">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
            <span className="text-slate-300 font-bold text-xs">{username}</span>
          </div>
          <div className="flex items-center space-x-3">
             {(isAdmin || permissions.includes('MOCKUP')) && <button onClick={() => setIsAdminDashboardOpen(true)} className="text-xs px-3 py-1.5 bg-teal-900/20 text-teal-300 border border-teal-500/30 rounded-md font-bold flex items-center"><Settings size={14} className="mr-1.5" /> Panel</button>}
             <button onClick={handleLogout} className="text-xs px-3 py-1.5 bg-slate-800 text-red-400 border border-slate-700 rounded-md font-medium flex items-center"><LogOut size={14} className="mr-1.5" /> Logout</button>
          </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10 mt-8 mb-4 flex justify-center">
        <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800 inline-flex shadow-inner">
           <button onClick={() => { setActiveTab(AppTab.POD); resetState(); }} className={`flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === AppTab.POD ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><LayoutGrid size={16} className="mr-2" /> POD System</button>
           <button onClick={() => { setActiveTab(AppTab.TSHIRT); resetState(); }} className={`flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all ml-1 ${activeTab === AppTab.TSHIRT ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Shirt size={16} className="mr-2" /> T-Shirt Studio</button>
        </div>
      </div>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 w-full z-10">
        {stage === ProcessStage.IDLE && (
           <div className="mb-8 space-y-6 animate-fade-in text-center">
              <h2 className={`text-3xl font-bold bg-clip-text text-transparent mb-2 ${activeTab === AppTab.TSHIRT ? 'bg-gradient-to-r from-purple-400 to-pink-400' : 'bg-gradient-to-r from-indigo-400 to-teal-400'}`}>
                 {activeTab === AppTab.TSHIRT ? "Professional T-Shirt Designer" : "POD Product Reimagination"}
              </h2>
              <div className={`grid grid-cols-1 ${activeTab === AppTab.TSHIRT ? 'max-w-md' : 'md:grid-cols-2 max-w-2xl'} gap-4 mx-auto bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg text-left`}>
                 {activeTab === AppTab.TSHIRT ? (
                    <div className="flex flex-col">
                      <label className="text-xs font-bold text-slate-400 uppercase mb-2">Aesthetic Retention</label>
                      <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800">
                          {['20%', '40%', '60%', '80%'].map((l) => (
                            <button key={l} onClick={() => setRetention(l as RetentionLevel)} className={`flex-1 py-1.5 rounded-md text-[10px] font-bold ${retention === l ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>{l}</button>
                          ))}
                      </div>
                    </div>
                 ) : (
                    <>
                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center"><Package size={12} className="mr-1" /> Category</label>
                        <select value={productType} onChange={(e) => setProductType(e.target.value)} className="bg-slate-950 border border-slate-700 text-slate-300 text-[10px] font-bold rounded-lg p-2 outline-none h-[42px]">
                          {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center"><Wand2 size={12} className="mr-1" /> Design Goal</label>
                        <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 h-[42px]">
                          <button onClick={() => setDesignMode(DesignMode.NEW_CONCEPT)} className={`flex-1 rounded-md text-[10px] font-bold ${designMode === DesignMode.NEW_CONCEPT ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>New Concept</button>
                          <button onClick={() => setDesignMode(DesignMode.ENHANCE_EXISTING)} className={`flex-1 rounded-md text-[10px] font-bold ${designMode === DesignMode.ENHANCE_EXISTING ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Enhance</button>
                        </div>
                      </div>
                    </>
                 )}
              </div>
              <FileUpload onFileSelect={processFile} />
              {error && (
                <div className="max-w-2xl mx-auto mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-start">
                   <AlertTriangle className="mr-3 flex-shrink-0 mt-0.5" size={18} />
                   <div className="flex-1">
                      <p className="font-bold mb-1">Cảnh báo hệ thống (Dành cho tài khoản Trả phí)</p>
                      <p className="text-xs opacity-90">{error}</p>
                   </div>
                </div>
              )}
           </div>
        )}

        {stage !== ProcessStage.IDLE && originalImage && (
          <ResultsPanel
            originalImage={originalImage}
            processedImage={processedImage}
            analysis={analysis}
            generatedRedesigns={generatedRedesigns}
            stage={stage}
            activeTab={activeTab}
            onImageClick={(idx) => { setSelectedRedesignIndex(idx); setIsDetailModalOpen(true); }}
          />
        )}
      </main>

      {isAdminDashboardOpen && <AdminDashboard isOpen={isAdminDashboardOpen} onClose={() => setIsAdminDashboardOpen(false)} currentUser={username} currentPermissions={permissions} />}
      {isHistoryOpen && <HistorySidebar isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={handleLoadHistory} onDelete={handleDeleteHistoryItem} isLoading={isLoadingHistory} />}
      {isCustomizeModalOpen && analysis && (
        <DesignAnalysisModal
          isOpen={isCustomizeModalOpen}
          onClose={() => setIsCustomizeModalOpen(false)}
          analysis={analysis}
          extractedElements={extractedElements}
          onGenerate={handleGenerateFromModal}
        />
      )}
      {isTshirtPromptModalOpen && analysis && (
        <TshirtPromptModal 
          isOpen={isTshirtPromptModalOpen}
          onClose={() => setIsTshirtPromptModalOpen(false)}
          analysis={analysis}
          processedImage={processedImage}
          onGenerate={handleTshirtGenerate}
        />
      )}
      {isDetailModalOpen && generatedRedesigns && selectedRedesignIndex !== null && (
        <RedesignDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          imageUrl={generatedRedesigns[selectedRedesignIndex]}
          onRemix={handleRemix}
          onRemoveBackground={async () => {}}
          onSplit={handleSplit}
          canUndo={!!prevRedesigns}
          onUndo={() => { if (prevRedesigns) { setRedesigns(prevRedesigns); setPrevRedesigns(null); } }}
          onGenerateMockup={async (img: string, onPartial?: (imgs: string[]) => void) => {
            let src = img;
            if (src.startsWith('http')) { try { src = await getImageBase64(src); } catch (e) {} }
            const effectiveType = (productType === PRODUCT_TYPES[0] && analysis?.detectedProductType) ? analysis.detectedProductType : productType;
            return await generateProductMockups(src, effectiveType, 6, onPartial);
          }}
          isRemixing={isRemixing}
          isTShirtMode={activeTab === AppTab.TSHIRT}
        />
      )}
    </div>
  );
}

export default App;
