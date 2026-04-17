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
  Star
} from 'lucide-react';

const apiKey = ""; // ランタイムから提供されるAPIキー

// --- 設定エリア (ここを変更するだけで調整可能) ---
const VOICE_NAME = "Charon"; 
const VOICE_PROMPT_PREFIX = "In a deep male voice with a clear US accent, speak naturally with very strong linking, reductions, and a natural conversational rhythm: ";

// --- 問題データ (シチュエーションを増やす場合はここに追加) ---
const DRILL_DATA = {
  tech_meeting: [
    { jp: "このバグを直すのにどれくらいかかりますか？", en: "How long will it take to fix this bug?" },
    { jp: "画面を共有してもいいですか？", en: "Can I share my screen?" },
    { jp: "サーバーに問題があるようです。", en: "It seems like there's an issue with the server." },
    { jp: "最新のデータをチェックさせてください。", en: "Let me check the latest data." },
    { jp: "この機能はまだ準備ができていません。", en: "This feature isn't ready yet." },
    { jp: "明日の朝までに終わらせます。", en: "I'll get it done by tomorrow morning." }
  ],
  sales_meeting: [
    { jp: "予算についてお話ししましょう。", en: "Let's talk about the budget." },
    { jp: "これが私たちの新しいプランです。", en: "This is our new plan." },
    { jp: "割引は可能ですか？", en: "Is it possible to get a discount?" },
    { jp: "後で詳細をメールします。", en: "I'll email you the details later." },
    { jp: "ご検討ありがとうございます。", en: "Thank you for your consideration." },
    { jp: "今のところ、これがベストな価格です。", en: "This is the best price for now." }
  ],
  interview: [
    { jp: "自己紹介をお願いします。", en: "Please tell me about yourself." },
    { jp: "なぜこの仕事に応募したのですか？", en: "Why did you apply for this job?" },
    { jp: "私の強みはチームワークです。", en: "My strength is teamwork." },
    { jp: "プレッシャーの中でも落ち着いていられます。", en: "I can stay calm under pressure." },
    { jp: "いつから働き始められますか？", en: "When can you start working?" }
  ],
  shopping: [
    { jp: "これのＭサイズはありますか？", en: "Do you have this in medium?" },
    { jp: "試着してもいいですか？", en: "Can I try this on?" },
    { jp: "ちょっと高すぎますね。", en: "It's a bit too expensive." },
    { jp: "クレジットカードは使えますか？", en: "Do you take credit cards?" },
    { jp: "これにします（買います）。", en: "I'll take this one." }
  ],
  travel: [
    { jp: "チェックインをお願いします。", en: "I'd like to check in, please." },
    { jp: "一番近いトイレはどこですか？", en: "Where's the nearest restroom?" },
    { jp: "タクシーを呼んでもらえますか？", en: "Could you call a taxi for me?" },
    { jp: "おすすめのレストランはありますか？", en: "Do you have any restaurant recommendations?" },
    { jp: "写真を撮ってもらえませんか？", en: "Could you take a picture of me?" }
  ]
};

// カテゴリの定義
const CATEGORIES = [
  { id: 'tech_meeting', label: '会議：技術', icon: Cpu },
  { id: 'sales_meeting', label: '会議：販売', icon: Coffee },
  { id: 'interview', label: '面接', icon: Briefcase },
  { id: 'shopping', label: '買い物', icon: ShoppingCart },
  { id: 'travel', label: '旅行', icon: Plane },
];

const App = () => {
  // --- 状態管理 (State) ---
  const [activeTab, setActiveTab] = useState('drill');
  const [category, setCategory] = useState('tech_meeting');
  const [drills, setDrills] = useState([]);
  const [currentDrillIdx, setCurrentDrillIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cachedAudio, setCachedAudio] = useState(null);
  const [isPrefetching, setIsPrefetching] = useState(false);

  // --- 初期化ロジック ---
  const shuffleAndSetCategory = (newCat) => {
    const data = DRILL_DATA[newCat];
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setDrills(shuffled);
    setCurrentDrillIdx(0);
    setShowAnswer(false);
    setCategory(newCat);
  };

  useEffect(() => {
    shuffleAndSetCategory('tech_meeting');
  }, []);

  // 次の問題のために音声を事前に生成（プリフェッチ）
  useEffect(() => {
    if (activeTab === 'drill' && drills.length > 0) {
      prefetchAudio(drills[currentDrillIdx].en);
    }
  }, [currentDrillIdx, activeTab, drills, category]);

  // --- 音声処理ユーティリティ ---
  const pcmToWav = (pcmData, sampleRate) => {
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
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
    for (let i = 0; i < pcmData.length; i++) {
      view.setInt16(44 + i * 2, pcmData[i], true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const prefetchAudio = async (text) => {
    setIsPrefetching(true);
    setCachedAudio(null);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${VOICE_PROMPT_PREFIX}${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICE_NAME }
              }
            }
          }
        })
      });

      if (!response.ok) throw new Error('TTS API Error');
      const result = await response.json();
      const audioData = result.candidates[0].content.parts[0].inlineData.data;
      const mimeType = result.candidates[0].content.parts[0].inlineData.mimeType;
      const sampleRate = parseInt(mimeType.match(/sampleRate=(\d+)/)?.[1] || "24000");

      const binaryString = atob(audioData);
      const pcmData = new Int16Array(binaryString.length / 2);
      for (let i = 0; i < pcmData.length; i++) {
        pcmData[i] = (binaryString.charCodeAt(i * 2 + 1) << 8) | binaryString.charCodeAt(i * 2);
      }

      const wavBlob = pcmToWav(pcmData, sampleRate);
      const audioUrl = URL.createObjectURL(wavBlob);
      setCachedAudio(audioUrl);
    } catch (err) {
      console.error("Audio prefetch error:", err);
    } finally {
      setIsPrefetching(false);
    }
  };

  const speakCached = () => {
    if (cachedAudio) {
      setIsSpeaking(true);
      const audio = new Audio(cachedAudio);
      audio.onended = () => setIsSpeaking(false);
      audio.play();
    }
  };

  // --- UI操作ハンドラ ---
  const handleCheckAnswer = () => {
    if (!showAnswer) {
      setShowAnswer(true);
      speakCached();
    } else {
      setShowAnswer(false);
    }
  };

  const handleNextDrill = () => {
    if (currentDrillIdx < drills.length - 1) {
      setCurrentDrillIdx(currentDrillIdx + 1);
      setShowAnswer(false);
    } else {
      // 最後の問題が終わったらシャッフルして最初に戻る
      shuffleAndSetCategory(category);
    }
  };

  // --- レンダリング (UIパーツ) ---
  const renderDrill = () => {
    if (drills.length === 0) return (
      <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
    );

    const currentDrill = drills[currentDrillIdx];

    return (
      <div className="flex flex-col gap-6 max-w-xl mx-auto p-4">
        {/* カテゴリ選択ボタン */}
        <div className="flex flex-wrap justify-center gap-2 mb-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => shuffleAndSetCategory(cat.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                  category === cat.id 
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                  : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                }`}
              >
                <Icon size={14} />
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* メインカード */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg text-center border border-slate-200 dark:border-slate-700 relative overflow-hidden transition-all min-h-[320px] flex flex-col justify-center">
          {/* ローディング表示 */}
          {isPrefetching && !showAnswer && (
            <div className="absolute top-2 right-4 flex items-center gap-1 text-[10px] text-slate-400">
              <Loader2 size={10} className="animate-spin" />
              <span>Linking ready...</span>
            </div>
          )}
          
          <div className="absolute top-4 left-6 flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
            <Star size={10} className="text-amber-500" />
            <span>{CATEGORIES.find(c => c.id === category)?.label} : {currentDrillIdx + 1} / {drills.length}</span>
          </div>

          <div className="mt-4">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3 block">Japanese</span>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-8 leading-snug">
              {currentDrill.jp}
            </h2>
          </div>
          
          {showAnswer && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-slate-100 dark:border-slate-700 pt-6">
               <span className="text-xs font-bold text-green-500 uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                 Natural English {isSpeaking && <Loader2 size={12} className="animate-spin" />}
               </span>
               <p className="text-2xl text-slate-700 dark:text-slate-200 font-bold mb-2">
                 {currentDrill.en}
               </p>
               <button 
                 onClick={speakCached}
                 className="mt-2 p-3 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all active:scale-90"
                 disabled={isSpeaking}
               >
                 <Volume2 size={28} className={isSpeaking ? 'opacity-50' : ''} />
               </button>
            </div>
          )}
        </div>

        {/* 操作ボタン */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={handleCheckAnswer}
            className="flex items-center justify-center gap-2 py-4 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-white rounded-xl font-bold hover:bg-slate-200 transition-colors shadow-sm"
          >
            {showAnswer ? <RotateCcw size={18} /> : <BookOpen size={18} />}
            {showAnswer ? "Hide" : "Show Answer"}
          </button>
          <button 
            onClick={handleNextDrill}
            className="flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:translate-y-0.5"
          >
            Next <Zap size={18} />
          </button>
        </div>
        
        {/* ヒントエリア */}
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-xl flex items-start gap-3">
          <Layers size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="text-[11px] text-blue-800 dark:text-blue-300">
            <strong>Training Tip:</strong> 答えを見る前に、声に出して予想してみましょう。リンキング（音の繋がり）を真似することで、リスニング力も向上します。
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans p-4 sm:p-8">
      {/* 共通ヘッダー */}
      <header className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tighter">
            QR TRAINER: PRO
          </h1>
          <p className="text-slate-500 font-bold text-sm">Situation-Based Response Training</p>
        </div>
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl shadow-inner">
          <button 
            onClick={() => setActiveTab('drill')}
            className={`flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-black transition-all ${activeTab === 'drill' ? 'bg-white dark:bg-slate-700 shadow-md text-blue-600 scale-105' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Zap size={16} /> Drill
          </button>
          <button 
            className="flex items-center gap-1.5 px-6 py-2 rounded-lg text-sm font-black text-slate-400 cursor-not-allowed opacity-50"
            disabled
          >
            <MessageSquare size={16} /> Chat
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto animate-in fade-in duration-500">
        {activeTab === 'drill' && renderDrill()}
      </main>

      {/* 共通フッター */}
      <footer className="max-w-4xl mx-auto mt-12 text-center">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-[10px] text-slate-400 shadow-sm font-bold">
          <Settings size={14} className="text-blue-500" />
          <span>Advanced Audio Engine: Linking & Reductions (US Charon Voice)</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
