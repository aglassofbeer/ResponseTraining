import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  MessageSquare, 
  BookOpen, 
  RotateCcw, 
  Send,
  Loader2,
  Volume2,
  Settings,
  Trophy,
  Layers,
  Coffee,
  Briefcase,
  ShoppingCart,
  Plane,
  Cpu,
  Star,
  Sparkles,
  Dices,
  Languages,
  AlertCircle,
  Bookmark,
  Trash2,
  ChevronRight
} from 'lucide-react';

const apiKey = ""; // ランタイムから提供されるAPIキー

// --- 設定エリア ---
const VOICE_NAME = "Charon"; 
const VOICE_PROMPT_PREFIX = "In a deep male voice with a clear US accent, speak naturally with very strong linking, reductions, and a natural conversational rhythm: ";

const CATEGORIES = [
  { 
    id: 'tech_meeting', 
    label: '会議：技術', 
    icon: Cpu, 
    context: "Software engineering, team management, office culture, career growth, tech topics (UI, security, infra, AI), or team conflicts." 
  },
  { 
    id: 'sales_meeting', 
    label: '会議：販売', 
    icon: Coffee, 
    context: "Sales pitches, client negotiations, product demos, closing deals, handling objections, follow-up emails, or market trends. Avoid repeating 'competitor analysis' or 'pricing' too often." 
  },
  { 
    id: 'interview', 
    label: '面接', 
    icon: Briefcase, 
    context: "Behavioral questions, future vision, work-life balance, technical background, or situational judgment." 
  },
  { 
    id: 'shopping', 
    label: '買い物', 
    icon: ShoppingCart, 
    context: "Returns, searching items, fashion advice, warranty, tech gadgets, or grocery shopping." 
  },
  { 
    id: 'travel', 
    label: '旅行', 
    icon: Plane, 
    context: "Hidden gems, local customs, itinerary changes, ticket issues, or meeting locals." 
  },
];

const App = () => {
  const [activeTab, setActiveTab] = useState('drill');
  const [category, setCategory] = useState('tech_meeting');
  const [currentDrill, setCurrentDrill] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cachedAudio, setCachedAudio] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrefetchingAudio, setIsPrefetchingAudio] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]); // 直近の履歴を保持して重複を避ける
  
  // 復習用リストの管理
  const [savedDrills, setSavedDrills] = useState([]);

  // 初期ロード：保存されたデータの読み込み
  useEffect(() => {
    const saved = localStorage.getItem('qr_trainer_saved_drills');
    if (saved) {
      try {
        setSavedDrills(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved drills");
      }
    }
    generateNewDrill('tech_meeting');
  }, []);

  // データの永続化
  useEffect(() => {
    localStorage.setItem('qr_trainer_saved_drills', JSON.stringify(savedDrills));
  }, [savedDrills]);

  const pcmToWav = (pcmData, sampleRate) => {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 32 + pcmData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcmData.length * 2, true);
    for (let i = 0; i < pcmData.length; i++) view.setInt16(44 + i * 2, pcmData[i], true);
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const prefetchAudio = async (text) => {
    setIsPrefetchingAudio(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${VOICE_PROMPT_PREFIX}${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } }
          }
        })
      });

      if (!response.ok) return null;
      const result = await response.json();
      const audioData = result.candidates[0].content.parts[0].inlineData.data;
      const mimeType = result.candidates[0].content.parts[0].inlineData.mimeType;
      const sampleRate = parseInt(mimeType.match(/sampleRate=(\d+)/)?.[1] || "24000");

      const binaryString = atob(audioData);
      const pcmData = new Int16Array(binaryString.length / 2);
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = (binaryString.charCodeAt(i * 2 + 1) << 8) | binaryString.charCodeAt(i * 2);
      }
      const url = URL.createObjectURL(pcmToWav(pcmData, sampleRate));
      setCachedAudio(url);
      return url;
    } catch (err) {
      console.warn("Audio prefetch failed");
      return null;
    } finally {
      setIsPrefetchingAudio(false);
    }
  };

  const generateNewDrill = async (catId) => {
    setIsGenerating(true);
    setError(null);
    setCurrentDrill(null);
    setShowAnswer(false);
    setCachedAudio(null);

    const catInfo = CATEGORIES.find(c => c.id === catId);
    const randomSeed = Math.random().toString(36).substring(7); // よりランダムな文字列
    const lastTopics = history.slice(-3).map(h => h.jp).join(", ");
    
    const systemPrompt = "You are a creative English teacher. Always provide standard English IPA phonetics. Never use Japanese Romaji or Japanese pronunciations in the 'ipa' field. Variety is key.";
    const userQuery = `
      Context: ${catInfo.context}
      Seed: ${randomSeed}
      Recent examples to avoid: ${lastTopics}
      
      Task:
      1. Create a unique short Japanese sentence (max 15 chars).
      2. Provide a natural conversational English translation (simple vocabulary).
      3. Provide the English IPA for the translation.
      
      Instructions: 
      - Be specific and varied. 
      - If Sales, think about contracts, appointments, demos, or trust-building. 
      - Do NOT repeat 'pricing' or 'competitors' if they were used recently.
      
      JSON: {"jp":"...","en":"...","ipa":"..."}`;

    try {
      let result = null;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: userQuery }] }],
              generationConfig: { 
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    jp: { type: "STRING" },
                    en: { type: "STRING" },
                    ipa: { type: "STRING" }
                  },
                  required: ["jp", "en", "ipa"]
                }
              }
            })
          });

          clearTimeout(timeoutId);
          if (!response.ok) throw new Error("API_ERROR");
          
          const data = await response.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!content) throw new Error("EMPTY_RESPONSE");
          
          result = JSON.parse(content);
          break;
        } catch (e) {
          retries++;
          if (retries >= maxRetries) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      setCurrentDrill(result);
      setHistory(prev => [...prev, result].slice(-10)); // 履歴を更新
      prefetchAudio(result.en);
    } catch (err) {
      setError("接続が不安定です。もう一度お試しください。");
    } finally {
      setIsGenerating(false);
    }
  };

  const speak = (audioUrl) => {
    if (audioUrl) {
      setIsSpeaking(true);
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(false);
      audio.play().catch(() => setIsSpeaking(false));
    }
  };

  const toggleSaveDrill = () => {
    if (!currentDrill) return;
    const isAlreadySaved = savedDrills.some(d => d.en === currentDrill.en);
    if (isAlreadySaved) {
      setSavedDrills(savedDrills.filter(d => d.en !== currentDrill.en));
    } else {
      setSavedDrills([{ ...currentDrill, id: Date.now() }, ...savedDrills]);
    }
  };

  const removeSavedDrill = (id) => {
    setSavedDrills(savedDrills.filter(d => d.id !== id));
  };

  const renderPhonetics = (en, ipa) => {
    if (!en || !ipa) return null;
    const words = en.split(' ');
    const cleanIpa = ipa.replace(/[\/\[\]]/g, '');
    const ipas = cleanIpa.split(/\s+/);

    return (
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-4 mb-4">
        {words.map((word, idx) => (
          <div key={idx} className="flex flex-col items-center">
            <span className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">{word}</span>
            <span className="text-[0.95rem] font-medium text-blue-600 dark:text-blue-400 font-mono tracking-normal mt-1">
              {ipas[idx] ? `/${ipas[idx].trim()}/` : ''}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderDrillTab = () => (
    <div className="flex flex-col gap-6 max-w-xl mx-auto">
      <div className="flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button key={cat.id} onClick={() => { setCategory(cat.id); generateNewDrill(cat.id); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all ${category === cat.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
              <Icon size={14} />{cat.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl text-center border border-slate-200 dark:border-slate-700 relative min-h-[350px] flex flex-col justify-center overflow-hidden">
        {isGenerating && (
          <div className="absolute inset-0 bg-white/90 dark:bg-slate-800/90 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl">
            <Loader2 className="text-blue-500 animate-spin" size={32} />
            <p className="text-xs font-bold text-slate-500">新しい問題を考えています...</p>
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex flex-col items-center gap-3">
            <AlertCircle size={24} />
            <p className="text-sm font-bold">{error}</p>
            <button onClick={() => generateNewDrill(category)} className="text-xs bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-bold">リトライ</button>
          </div>
        )}

        {currentDrill && !error && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className="mb-6">
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 block">Japanese</span>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white leading-snug">{currentDrill.jp}</h2>
            </div>
            
            {showAnswer && (
              <div className="mt-6 border-t border-slate-100 dark:border-slate-700 pt-6 animate-in slide-in-from-top-4 duration-300 relative">
                <button 
                  onClick={toggleSaveDrill} 
                  className={`absolute top-4 right-0 p-2 rounded-full transition-colors ${savedDrills.some(d => d.en === currentDrill.en) ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-slate-400'}`}
                  title="復習リストに追加"
                >
                  <Bookmark size={20} fill={savedDrills.some(d => d.en === currentDrill.en) ? "currentColor" : "none"} />
                </button>

                <span className="text-[10px] font-black text-green-500 uppercase tracking-widest mb-6 flex items-center justify-center gap-1"><Languages size={12} /> Natural English</span>
                {renderPhonetics(currentDrill.en, currentDrill.ipa)}
                <button onClick={() => speak(cachedAudio)} className="mt-6 p-3 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all active:scale-90" disabled={isSpeaking || !cachedAudio}>
                  <Volume2 size={28} className={isSpeaking ? 'opacity-50 animate-pulse' : ''} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => { if(!showAnswer && currentDrill) { setShowAnswer(true); speak(cachedAudio); } else { setShowAnswer(false); } }} disabled={isGenerating || !currentDrill} className="flex items-center justify-center gap-2 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white rounded-xl font-bold hover:bg-slate-200 disabled:opacity-50 transition-all">{showAnswer ? <RotateCcw size={18} /> : <BookOpen size={18} />}{showAnswer ? "Hide" : "Show"}</button>
        <button onClick={() => generateNewDrill(category)} disabled={isGenerating} className="flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-200 transition-all active:translate-y-0.5">Next <Zap size={18} /></button>
      </div>
    </div>
  );

  const renderReviewTab = () => (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
          <Bookmark size={20} className="text-amber-500" /> 復習リスト ({savedDrills.length})
        </h2>
        {savedDrills.length > 0 && (
          <button onClick={() => { if(confirm("全て削除しますか？")) setSavedDrills([]); }} className="text-xs text-slate-400 hover:text-red-500 font-bold flex items-center gap-1">
            <Trash2 size={12} /> Clear All
          </button>
        )}
      </div>

      {savedDrills.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <Bookmark size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold">まだ保存された問題はありません。<br/><span className="text-xs font-normal">Drill中にブックマークアイコンを押して保存しましょう。</span></p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {savedDrills.map((drill) => (
            <div key={drill.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-500 uppercase mb-1">Japanese</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{drill.jp}</p>
                </div>
                <button onClick={() => removeSavedDrill(drill.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-black text-green-500 uppercase mb-3">English</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {drill.en.split(' ').map((word, i) => (
                      <div key={i} className="flex flex-col">
                        <span className="font-bold text-slate-700 dark:text-slate-200">{word}</span>
                        <span className="text-[0.7rem] text-blue-500 font-mono">/{drill.ipa.replace(/[\/\[\]]/g, '').split(/\s+/)[i]}/</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    const url = await prefetchAudio(drill.en);
                    speak(url);
                  }}
                  className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full hover:bg-blue-100 transition-all active:scale-95"
                >
                  <Volume2 size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans p-4 sm:p-8">
      <header className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tighter">QR TRAINER</h1>
          <p className="text-slate-500 font-bold text-sm">Turbo Generation & Review</p>
        </div>
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl shadow-inner">
          <button 
            onClick={() => setActiveTab('drill')} 
            className={`flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'drill' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 scale-105' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Zap size={16} /> Drill
          </button>
          <button 
            onClick={() => setActiveTab('review')} 
            className={`flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'review' ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-500 scale-105' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Bookmark size={16} /> Review
            {savedDrills.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded-full">{savedDrills.length}</span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto min-h-[500px]">
        {activeTab === 'drill' ? renderDrillTab() : renderReviewTab()}
      </main>

      <footer className="max-w-4xl mx-auto mt-12 text-center text-slate-400">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-[10px] font-bold shadow-sm">
          <Settings size={14} className="text-blue-500" />
          <span>Gemini 2.5 Flash / Persistence: LocalStorage</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
