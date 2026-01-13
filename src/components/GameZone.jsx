import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, Play, RotateCcw, Zap, Flame } from 'lucide-react';

export default function GameZone() {
  const { currentUser } = useAuth();
  const canvasRef = useRef(null);
  
  // React State for UI (Score, Game Over screen)
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  // Game Engine State (Refs are used for 60FPS performance without re-renders)
  const gameState = useRef({
    playerX: 0,
    obstacles: [],
    particles: [], // For explosions
    speed: 5,
    score: 0,
    animationId: null,
    isGameOver: false
  });

  // 1. FETCH LEADERBOARD (Standard Quota-Safe Logic)
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

  // 2. GAME LOOP (The "Engine")
  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    
    // Reset Engine State
    gameState.current = {
      playerX: canvasRef.current.width / 2,
      obstacles: [],
      particles: [],
      speed: 4,
      score: 0,
      isGameOver: false,
      lastSpeedIncrease: 0
    };

    // Start Loop
    cancelAnimationFrame(gameState.current.animationId);
    loop();
  };

  const loop = () => {
    if (gameState.current.isGameOver) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const state = gameState.current;

    // A. CLEAR SCREEN
    ctx.fillStyle = '#0f172a'; // Dark Slate BG
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // B. PLAYER (Neon Triangle)
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#06b6d4'; // Cyan Glow
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(state.playerX, canvas.height - 80);
    ctx.lineTo(state.playerX - 20, canvas.height - 30);
    ctx.lineTo(state.playerX + 20, canvas.height - 30);
    ctx.fill();
    ctx.shadowBlur = 0; // Reset for other items

    // C. SPAWN OBSTACLES (Random red blocks)
    if (Math.random() < 0.02 + (state.score * 0.0001)) { // Spawn rate increases with score
      state.obstacles.push({
        x: Math.random() * (canvas.width - 40) + 20,
        y: -50,
        width: Math.random() * 40 + 30, // Random size
        height: 30,
        speed: state.speed
      });
    }

    // D. MOVE & DRAW OBSTACLES
    state.obstacles.forEach((obs, index) => {
      obs.y += obs.speed;
      
      // Draw Obstacle
      ctx.fillStyle = '#f43f5e'; // Rose Red
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#e11d48';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.shadowBlur = 0;

      // Collision Detection
      if (
        obs.y + obs.height > canvas.height - 80 && // Top of ship
        obs.y < canvas.height - 30 &&              // Bottom of ship
        obs.x < state.playerX + 15 &&              // Right wing
        obs.x + obs.width > state.playerX - 15     // Left wing
      ) {
        endGame();
      }

      // Remove off-screen obstacles & Add Score
      if (obs.y > canvas.height) {
        state.obstacles.splice(index, 1);
        state.score += 10;
        setScore(state.score); // Sync with React

        // Increase Speed every 500 points
        if (state.score % 500 === 0 && state.speed < 15) {
            state.speed += 0.5;
        }
      }
    });

    state.animationId = requestAnimationFrame(loop);
  };

  const endGame = () => {
    gameState.current.isGameOver = true;
    cancelAnimationFrame(gameState.current.animationId);
    setGameOver(true);
    saveHighScore(gameState.current.score);
  };

  // 3. CONTROLS (Mouse/Touch Follow)
  const handleMouseMove = (e) => {
    if (!gameStarted || gameOver) return;
    const rect = canvasRef.current.getBoundingClientRect();
    gameState.current.playerX = e.clientX - rect.left;
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-100px)] gap-6 p-6 animate-in fade-in">
      
      {/* GAME AREA */}
      <div className="flex-1 bg-slate-900 rounded-3xl shadow-2xl overflow-hidden relative border-4 border-slate-800 group cursor-none">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          className="w-full h-full object-cover"
          onMouseMove={handleMouseMove}
        />

        {/* HUD (Heads Up Display) */}
        <div className="absolute top-6 left-6 text-white font-mono z-10 pointer-events-none">
          <div className="text-3xl font-black italic flex items-center gap-2">
            <Zap className="text-yellow-400 fill-yellow-400" /> 
            {score}
          </div>
          <div className="text-sm text-cyan-400 mt-1 opacity-80">SPEED: {gameState.current?.speed?.toFixed(1) || 4}x</div>
        </div>

        {/* START SCREEN */}
        {!gameStarted && !gameOver && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-20">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-4 tracking-tighter filter drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
              NEON RUSH
            </h1>
            <button onClick={startGame} className="bg-cyan-500 hover:bg-cyan-400 text-black px-10 py-4 rounded-full font-black text-xl transition-all hover:scale-110 shadow-[0_0_20px_rgba(6,182,212,0.6)] flex items-center gap-3">
              <Play fill="black" size={24} /> LAUNCH
            </button>
            <p className="mt-6 text-slate-400 font-mono text-sm">Use your MOUSE to dodge obstacles</p>
          </div>
        )}

        {/* GAME OVER SCREEN */}
        {gameOver && (
          <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center text-white z-20 animate-in zoom-in duration-300">
            <Flame size={80} className="text-orange-500 mb-4 animate-bounce" />
            <h2 className="text-5xl font-black mb-2 tracking-wide">CRITICAL FAILURE</h2>
            <div className="text-2xl mb-8 font-mono">FINAL SCORE: <span className="text-yellow-400 font-bold">{score}</span></div>
            
            <button onClick={startGame} className="bg-white text-red-600 px-8 py-3 rounded-full font-bold text-lg hover:bg-slate-100 flex items-center gap-2 transition-transform hover:scale-105">
              <RotateCcw size={20} /> RESTART MISSION
            </button>
          </div>
        )}
      </div>

      {/* LEADERBOARD (Right Side) */}
      <div className="w-full lg:w-80 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
        <div className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="text-yellow-400" />
            <h2 className="font-black tracking-widest text-lg">ACE PILOTS</h2>
          </div>
          <div className="flex justify-between items-end">
            <div className="text-xs text-slate-400">Your Best</div>
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