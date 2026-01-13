import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, Play, RotateCcw, Zap, Target, Crosshair } from 'lucide-react';

export default function GameZone() {
  const { currentUser } = useAuth();
  const canvasRef = useRef(null);
  
  // UI State
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  // Game Engine State
  const gameState = useRef({
    playerX: 0,
    bullets: [],
    enemies: [],
    particles: [], // Explosions
    speed: 3,
    score: 0,
    animationId: null,
    isGameOver: false,
    lastShotTime: 0
  });

  // 1. LEADERBOARD (Quota Safe)
  useEffect(() => {
    fetchLeaderboard();
    fetchPersonalBest();
  }, [currentUser]);

  const fetchLeaderboard = async () => {
    const q = query(collection(db, 'high_scores'), orderBy('score', 'desc'), limit(10));
    const snap = await getDocs(q);
    setLeaderboard(snap.docs.map(d => d.data()));
  };

  const fetchPersonalBest = async () => {
    if (!currentUser) return;
    const docRef = doc(db, 'high_scores', currentUser.id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) setHighScore(docSnap.data().score);
  };

  const saveHighScore = async (finalScore) => {
    if (finalScore > highScore) {
      setHighScore(finalScore);
      await setDoc(doc(db, 'high_scores', currentUser.id), {
        userId: currentUser.id,
        userName: currentUser.fullname,
        score: finalScore,
        date: new Date().toISOString()
      });
      fetchLeaderboard();
    }
  };

  // 2. GAME LOOP
  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    
    gameState.current = {
      playerX: canvasRef.current.width / 2,
      bullets: [],
      enemies: [],
      particles: [],
      speed: 3,
      score: 0,
      isGameOver: false,
      lastShotTime: 0
    };

    cancelAnimationFrame(gameState.current.animationId);
    loop();
  };

  const createExplosion = (x, y, color) => {
    for (let i = 0; i < 15; i++) {
      gameState.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color: color
      });
    }
  };

  const loop = () => {
    if (gameState.current.isGameOver) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const state = gameState.current;

    // A. BACKGROUND & CLEAR
    ctx.fillStyle = '#020617'; // Deep Space
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Starfield Effect
    ctx.fillStyle = '#ffffff';
    if (Math.random() < 0.2) {
       ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }

    // B. PLAYER (Shooter)
    const playerY = canvas.height - 80;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#0ea5e9'; // Sky Blue Glow
    ctx.fillStyle = '#0ea5e9';
    
    // Draw Ship
    ctx.beginPath();
    ctx.moveTo(state.playerX, playerY);
    ctx.lineTo(state.playerX - 25, playerY + 50);
    ctx.lineTo(state.playerX, playerY + 35); // Engine indent
    ctx.lineTo(state.playerX + 25, playerY + 50);
    ctx.fill();

    // C. BULLETS
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#facc15'; // Yellow Glow
    ctx.fillStyle = '#facc15';
    
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.y -= 15; // Bullet Speed
      ctx.fillRect(b.x - 2, b.y, 4, 20); // Laser beam

      if (b.y < 0) state.bullets.splice(i, 1);
    }

    // D. ENEMIES
    // Spawn Logic
    if (Math.random() < 0.02 + (state.score * 0.00005)) { 
      state.enemies.push({
        x: Math.random() * (canvas.width - 50) + 25,
        y: -50,
        size: 30 + Math.random() * 20,
        speed: state.speed + Math.random()
      });
    }

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      e.y += e.speed;

      // Draw Enemy
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#f43f5e';
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size/2, 0, Math.PI * 2); // Circular enemies
      ctx.fill();

      // PLAYER COLLISION (Game Over)
      // Simple box collision
      if (
        e.y + e.size/2 > playerY &&
        e.y - e.size/2 < playerY + 50 &&
        e.x + e.size/2 > state.playerX - 20 &&
        e.x - e.size/2 < state.playerX + 20
      ) {
        endGame();
      }

      // BULLET COLLISION (Destruction)
      for (let j = state.bullets.length - 1; j >= 0; j--) {
        const b = state.bullets[j];
        // Distance check
        const dx = b.x - e.x;
        const dy = b.y - e.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < e.size/2 + 5) {
          // HIT!
          createExplosion(e.x, e.y, '#f43f5e');
          state.enemies.splice(i, 1);
          state.bullets.splice(j, 1);
          
          state.score += 50;
          setScore(state.score);
          
          // Difficulty Ramp
          if (state.score % 1000 === 0 && state.speed < 12) state.speed += 0.5;
          break; // Break bullet loop
        }
      }

      // Remove off-screen
      if (e.y > canvas.height) {
         state.enemies.splice(i, 1);
         // Penalty for missing? Optional. Let's keep it casual.
      }
    }

    // E. PARTICLES (Explosions)
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.05;

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
      ctx.globalAlpha = 1.0;

      if (p.life <= 0) state.particles.splice(i, 1);
    }

    state.animationId = requestAnimationFrame(loop);
  };

  const shoot = () => {
    if (gameState.current.isGameOver) return;
    
    // Rate limiter (spam prevention)
    const now = Date.now();
    if (now - gameState.current.lastShotTime > 150) {
       gameState.current.bullets.push({
         x: gameState.current.playerX,
         y: canvasRef.current.height - 80
       });
       gameState.current.lastShotTime = now;
    }
  };

  const endGame = () => {
    gameState.current.isGameOver = true;
    cancelAnimationFrame(gameState.current.animationId);
    setGameOver(true);
    saveHighScore(gameState.current.score);
  };

  // 3. CONTROLS
  const handleMouseMove = (e) => {
    if (!gameStarted || gameOver) return;
    const rect = canvasRef.current.getBoundingClientRect();
    gameState.current.playerX = e.clientX - rect.left;
  };

  const handleClick = (e) => {
    if (!gameStarted && !gameOver) return; // Prevent shooting on start screen
    shoot();
  };

  // Keyboard support (Space to shoot)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space') shoot();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-6 p-6 animate-in fade-in select-none">
      
      {/* GAME AREA */}
      <div className="flex-1 bg-slate-900 rounded-3xl shadow-2xl overflow-hidden relative border-4 border-slate-800 group cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-full object-cover"
          onMouseMove={handleMouseMove}
          onMouseDown={handleClick}
        />

        {/* HUD */}
        <div className="absolute top-6 left-6 text-white font-mono z-10 pointer-events-none mix-blend-difference">
          <div className="text-3xl font-black italic flex items-center gap-3">
            <Target className="text-red-500" /> 
            {score}
          </div>
          <div className="text-sm text-slate-300 mt-1 ml-10">WAVE SPEED: {gameState.current?.speed?.toFixed(1) || 3}x</div>
        </div>

        {/* START SCREEN */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-20">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-cyan-300 mb-2 tracking-tighter">
              SPACE DEFENDER
            </h1>
            <div className="flex items-center gap-2 text-yellow-400 mb-8 font-mono text-sm tracking-widest">
                <Crosshair size={16}/> TARGET PRACTICE
            </div>
            
            <button onClick={startGame} className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-full font-black text-xl transition-all hover:scale-110 shadow-lg shadow-indigo-500/50 flex items-center gap-3">
              <Play fill="white" size={24} /> LAUNCH MISSION
            </button>
            <div className="mt-8 text-center text-slate-400 font-mono text-xs">
                <p className="mb-1">MOUSE to Move</p>
                <p>CLICK or SPACE to Fire</p>
            </div>
          </div>
        )}

        {/* GAME OVER SCREEN */}
        {gameOver && (
          <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center text-white z-20 animate-in zoom-in duration-300">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-4xl font-black mb-2 tracking-wide text-red-500">MISSION FAILED</h2>
            <div className="text-xl mb-8 font-mono">FINAL SCORE: <span className="text-white font-bold text-3xl ml-2">{score}</span></div>
            
            <button onClick={startGame} className="bg-white text-red-900 px-8 py-3 rounded-full font-bold text-lg hover:bg-red-50 flex items-center gap-2 transition-transform hover:scale-105 shadow-xl">
              <RotateCcw size={20} /> RESTART SYSTEM
            </button>
          </div>
        )}
      </div>

      {/* LEADERBOARD */}
      <div className="w-full lg:w-80 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
        <div className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="text-yellow-400" />
            <h2 className="font-black tracking-widest text-lg">TOP GUNS</h2>
          </div>
          <div className="flex justify-between items-end">
            <div className="text-xs text-slate-400">Your Record</div>
            <div className="text-xl font-mono text-cyan-400 font-bold">{highScore}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 bg-slate-50">
          {leaderboard.map((entry, index) => (
            <div key={index} className={`flex items-center p-3 mb-2 rounded-xl border transition-all hover:scale-[1.02] ${index === 0 ? 'bg-yellow-50 border-yellow-200 shadow-sm' : 'bg-white border-slate-200'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold mr-3 text-sm ${
                index === 0 ? 'bg-yellow-400 text-yellow-900' : 
                index === 1 ? 'bg-slate-300 text-slate-700' : 
                index === 2 ? 'bg-orange-200 text-orange-800' : 'bg-slate-100 text-slate-500'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 text-sm truncate">{entry.userName}</div>
                <div className="text-[10px] text-slate-400 font-medium">Rank #{index + 1}</div>
              </div>
              <div className="font-mono font-bold text-indigo-600">
                {entry.score}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}