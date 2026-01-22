import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'flappy-stranger-balanced-v2';

const App = () => {
  const [gameActive, setGameActive] = useState(false);
  const [menuState, setMenuState] = useState('start'); 
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState('HAWKINS'); 
  const [vessel, setVessel] = useState('STEVE');
  const [user, setUser] = useState(null);
  const [personalBest, setPersonalBest] = useState(0);
  const [isSlowModeEnabled, setIsSlowModeEnabled] = useState(false);
  const [speedLevel, setSpeedLevel] = useState(1);
  
  const canvasRef = useRef(null);
  const gameLoopRef = useRef(null);
  const audioCtx = useRef(null);

  const state = useRef({
    player: { y: 300, v: 0 },
    pipes: [],
    startTime: 0,
    currentSpeed: 2.6,
    slowTimer: 0,
    config: { gravity: 0.22, flap: -4.8, gap: 185 } 
  });

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || isSlowModeEnabled) {
      setPersonalBest(0);
      return;
    }
    const scoresCol = collection(db, 'artifacts', appId, 'users', user.uid, 'scores');
    const unsub = onSnapshot(scoresCol, (snap) => {
      const modeScores = snap.docs
        .map(d => d.data())
        .filter(d => d.mode === difficulty)
        .sort((a, b) => b.score - a.score);
      setPersonalBest(modeScores.length > 0 ? modeScores[0].score : 0);
    });
    return () => unsub();
  }, [user, difficulty, isSlowModeEnabled]);

  const update = () => {
    if (!gameActive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = state.current;
    
    const tScale = (isSlowModeEnabled && s.slowTimer > 0) ? 0.45 : 1.0;
    if (s.slowTimer > 0) s.slowTimer--;

    // UPSIDE DOWN PROGRESSIVE SPEED LOGIC
    if (difficulty === 'UPSIDE-DOWN') {
      const elapsedSeconds = (Date.now() - s.startTime) / 1000;
      const level = Math.floor(elapsedSeconds / 10) + 1;
      if (level !== speedLevel) setSpeedLevel(level);
      
      // Starts at 3.0, adds 0.4 every 10 seconds
      s.currentSpeed = 3.0 + ((level - 1) * 0.4); 
    } else {
      s.currentSpeed = 2.7; 
      if (speedLevel !== 1) setSpeedLevel(1);
    }

    s.player.v += s.config.gravity * tScale;
    s.player.y += s.player.v * tScale;

    if (s.player.y > canvas.height || s.player.y < 0) return endGame();

    // Pipe spacing: Medium challenge (260px)
    const lastPipe = s.pipes[s.pipes.length - 1];
    if (!lastPipe || (canvas.width - lastPipe.x) >= 260) {
        const t = Math.random() * (canvas.height - s.config.gap - 200) + 100;
        s.pipes.push({ x: canvas.width, t, pass: false });
    }

    s.pipes.forEach((p, i) => {
      p.x -= s.currentSpeed * tScale;
      
      // Collision detection: Adjusted to be fair but firm
      if (70 + 10 > p.x && 70 - 10 < p.x + 50) {
        if (s.player.y - 10 < p.t || s.player.y + 10 > p.t + s.config.gap) endGame();
      }
      
      if (!p.pass && p.x < 70) { 
        p.pass = true; 
        setScore(v => v + 1); 
      }
      if (p.x < -100) s.pipes.splice(i, 1);
    });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = state.current;

    ctx.fillStyle = (difficulty === 'UPSIDE-DOWN') ? '#020208' : '#080000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // BACKGROUND LOGO: Bold & Sharp
    ctx.save();
    ctx.font = "900 68px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = difficulty === 'UPSIDE-DOWN' ? 'rgba(0,180,255,0.08)' : 'rgba(255,0,0,0.08)';
    ctx.strokeText("FLAPPY", canvas.width/2, canvas.height/2 - 40);
    ctx.strokeText("STRANGER", canvas.width/2, canvas.height/2 + 40);
    ctx.restore();

    s.pipes.forEach(p => {
      ctx.fillStyle = '#000';
      ctx.fillRect(p.x, 0, 50, p.t);
      ctx.fillRect(p.x, p.t + s.config.gap, 50, canvas.height);
      ctx.strokeStyle = difficulty === 'UPSIDE-DOWN' ? '#00e5ff' : '#ff1111';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, 0, 50, p.t);
      ctx.strokeRect(p.x, p.t + s.config.gap, 50, canvas.height);
    });

    ctx.save();
    ctx.translate(70, s.player.y);
    ctx.rotate(s.player.v * 0.12);
    if (vessel === 'STEVE') {
      ctx.fillStyle = '#6b3e23'; ctx.beginPath(); ctx.roundRect(-6, -18, 12, 36, 2); ctx.fill();
      ctx.fillStyle = '#ccc'; ctx.fillRect(-7, -12, 14, 2); ctx.fillRect(-7, 4, 14, 2); 
    } else {
      ctx.font = "34px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(vessel === 'ELEVEN' ? '🧇' : '🕰️', 0, 0);
    }
    ctx.restore();
  };

  const handleInput = (e) => {
    if (e) e.preventDefault();
    if (gameActive) {
      state.current.player.v = state.current.config.flap;
      if (isSlowModeEnabled) state.current.slowTimer = 22; 
    }
  };

  const resetGame = () => {
    const canvas = canvasRef.current;
    state.current.player = { y: canvas.height / 2, v: 0 };
    state.current.pipes = [];
    state.current.startTime = Date.now();
    setSpeedLevel(1);
    
    // Balanced settings
    state.current.config = difficulty === 'HAWKINS' ? 
        { gravity: 0.22, flap: -4.8, gap: 190 } : 
        { gravity: 0.28, flap: -5.4, gap: 175 };
    
    setScore(0);
    setGameActive(true);
    setMenuState('playing');
  };

  const endGame = async () => {
    const fs = score;
    setGameActive(false);
    setMenuState('gameOver');
    if (user && fs > 0 && !isSlowModeEnabled) {
      const col = collection(db, 'artifacts', appId, 'users', user.uid, 'scores');
      await addDoc(col, { score: fs, mode: difficulty, timestamp: serverTimestamp() });
    }
  };

  useEffect(() => {
    const loop = () => { update(); draw(); gameLoopRef.current = requestAnimationFrame(loop); };
    gameLoopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [gameActive, score, isSlowModeEnabled, difficulty, vessel]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#030303] text-white touch-none select-none overflow-hidden font-sans">
      <div className="relative aspect-[9/16] h-full max-h-screen bg-black overflow-hidden border-x border-zinc-900">
        <canvas ref={canvasRef} width={360} height={640} className="w-full h-full cursor-pointer" onMouseDown={handleInput} onTouchStart={handleInput} />

        {menuState === 'playing' && (
          <div className="absolute top-14 inset-x-0 flex flex-col items-center pointer-events-none">
            <span className="text-7xl font-black text-white italic drop-shadow-md tracking-tighter">{score}</span>
            <div className="flex gap-2 mt-1">
               <div className="bg-black/40 px-3 py-1 backdrop-blur-sm border border-white/5 flex items-center gap-3">
                <span className="text-[9px] tracking-[0.2em] font-black text-zinc-400 uppercase">{difficulty}</span>
                {difficulty === 'UPSIDE-DOWN' && (
                  <span className="text-[9px] text-cyan-400 font-black">LVL {speedLevel}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {menuState !== 'playing' && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-8 text-center backdrop-blur-md">
            {menuState === 'start' ? (
              <div className="w-full space-y-8">
                <div className="space-y-0">
                  <h1 className="text-6xl font-black text-red-700 italic tracking-tighter">FLAPPY</h1>
                  <h1 className="text-2xl font-black text-white tracking-[.3em] opacity-80 -mt-2">STRANGER</h1>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setDifficulty('HAWKINS')} className={`py-4 text-[10px] font-black border-2 transition-all ${difficulty === 'HAWKINS' ? 'border-red-600 text-red-500 bg-red-600/5' : 'border-zinc-800 text-zinc-600'}`}>HAWKINS</button>
                    <button onClick={() => setDifficulty('UPSIDE-DOWN')} className={`py-4 text-[10px] font-black border-2 transition-all ${difficulty === 'UPSIDE-DOWN' ? 'border-cyan-600 text-cyan-500 bg-cyan-600/5' : 'border-zinc-800 text-zinc-600'}`}>UPSIDE-DOWN</button>
                  </div>

                  <div className="bg-zinc-900/40 p-5 border border-zinc-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="text-left">
                        <p className="text-[11px] font-black text-white tracking-widest uppercase">Psychic Burst</p>
                        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider italic">Slows movement</p>
                      </div>
                      <button onClick={() => setIsSlowModeEnabled(!isSlowModeEnabled)} className={`w-12 h-6 border-2 transition-colors relative ${isSlowModeEnabled ? 'bg-cyan-600 border-cyan-400' : 'bg-zinc-800 border-zinc-700'}`}>
                        <div className={`absolute top-0.5 bottom-0.5 w-4.5 bg-white transition-all ${isSlowModeEnabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-around items-center h-20">
                    {[
                      { id: 'ELEVEN', icon: ' waffle ' },
                      { id: 'STEVE', icon: '🏏' },
                      { id: 'VECNA', icon: '🕰️' }
                    ].map(v => (
                      <button key={v.id} onClick={() => setVessel(v.id)} className={`flex flex-col items-center gap-2 transition-all duration-300 ${vessel === v.id ? 'scale-125 opacity-100' : 'opacity-20 grayscale'}`}>
                        <span className="text-4xl">{v.id === 'ELEVEN' ? '🧇' : v.icon}</span>
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">{v.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-6">
                  <button onClick={resetGame} className="w-full py-5 bg-red-700 font-black text-2xl tracking-tight active:scale-95 transition-all shadow-lg uppercase italic">Deploy</button>
                  {!isSlowModeEnabled && (
                    <div className="bg-zinc-900/30 py-3 border-y border-zinc-800/50">
                      <p className="text-[10px] font-black text-zinc-500 tracking-[0.4em] uppercase mb-1">
                        {difficulty} Highest Score
                      </p>
                      <p className="text-3xl font-black text-white italic tracking-tighter">{personalBest}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-black italic text-red-600 tracking-tighter">CONNECTION LOST</h2>
                  <div className="bg-zinc-900/40 border border-zinc-800 py-10">
                    <p className="text-zinc-500 text-[10px] font-black uppercase mb-2 tracking-widest">FINAL SCORE</p>
                    <h3 className="text-8xl font-black italic tracking-tighter">{score}</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  <button onClick={resetGame} className="w-full py-5 bg-red-700 font-black text-xl hover:bg-red-600 transition-all uppercase italic">Re-initialize</button>
                  <button onClick={() => setMenuState('start')} className="w-full py-4 border border-zinc-800 text-zinc-500 text-[10px] font-black tracking-widest uppercase">Abort</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;

