import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDate } from '../contexts/DateContext'; 
import { useTimer } from '../contexts/TimerContext'; 
import { useActivityMonitor } from '../hooks/useActivityMonitor'; 
import AssignTaskModal from './AssignTaskModal';   
import Timer from './Timer';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'; 
import { 
  Zap, LayoutGrid, Users, FolderOpen, 
  CheckCircle, History, LogOut, Calendar, Plus,
  Briefcase, DollarSign, BarChart3, Pause, Play, ZapOff, Coffee, Lock, Loader2, Gamepad2, Presentation
} from 'lucide-react';

// Format Helper
const formatDuration = (ms) => {
  if (!ms) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// --- GLOBAL TIMER WIDGET ---
function GlobalTimerWidget() {
  const { activeTask, activeInterruption, stopTask } = useTimer();

  if (activeInterruption) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-red-600 text-white p-3 z-50 flex justify-center items-center gap-4 animate-pulse shadow-lg">
        <ZapOff size={20} />
        <span className="font-bold tracking-wide">POWER CUT ACTIVE - WORK PAUSED</span>
      </div>
    );
  }

  if (!activeTask) return null;

  return (
    <div className="fixed bottom-6 right-8 bg-slate-900 text-white shadow-2xl rounded-full px-6 py-3 z-50 flex items-center gap-6 border border-slate-700 animate-in slide-in-from-bottom-10">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Task</span>
        <span className="font-bold text-sm max-w-[200px] truncate">{activeTask.description}</span>
      </div>
      <div className="font-mono text-xl font-bold text-emerald-400 min-w-[80px] text-center">
        <Timer startTime={activeTask.lastStartTime} elapsed={activeTask.elapsedMs} isRunning={true} />
      </div>
      <button onClick={stopTask} className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-all hover:scale-105" title="Stop Timer">
        <Pause size={18} fill="currentColor" />
      </button>
    </div>
  );
}

// --- MAIN LAYOUT COMPONENT ---
export default function Layout() {
  const { currentUser, logout, changePassword } = useAuth(); 
  const { globalDate, setGlobalDate } = useDate(); 
  const { stopTask, activeTask } = useTimer(); 
  const [isModalOpen, setIsModalOpen] = useState(false); 
  const [breakElapsed, setBreakElapsed] = useState(0);
  
  // --- NEW: Loading State for Break Button ---
  const [breakLoading, setBreakLoading] = useState(false);

  const navigate = useNavigate();

  useActivityMonitor(currentUser); 

  // Break Timer
  useEffect(() => {
    let interval;
    if (currentUser?.onlineStatus === 'Break' && currentUser?.lastBreakStart) {
        interval = setInterval(() => setBreakElapsed(Date.now() - currentUser.lastBreakStart), 1000);
    } else {
        setBreakElapsed(0);
    }
    return () => clearInterval(interval);
  }, [currentUser?.onlineStatus, currentUser?.lastBreakStart]);

  const handleLogout = () => { logout(); navigate('/'); };
  const handlePasswordChange = () => {
      const newPass = prompt("Enter your new password:");
      if (newPass) changePassword(newPass);
  };

  const toggleBreak = async () => {
    if (!currentUser) return;
    if (breakLoading) return; // Prevent double clicks

    setBreakLoading(true); // Disable button immediately
    const userRef = doc(db, 'users', currentUser.id);

    try {
        if (currentUser.onlineStatus === 'Break') {
            // END BREAK
            const duration = Date.now() - (currentUser.lastBreakStart || Date.now());
            if (duration > 1000) {
                await addDoc(collection(db, 'breaks'), {
                    userId: currentUser.id, userName: currentUser.fullname,
                    startTime: currentUser.lastBreakStart, endTime: Date.now(),
                    durationMs: duration, date: new Date().toISOString().split('T')[0]
                });
            }
            await updateDoc(userRef, { onlineStatus: 'Online', lastSeen: serverTimestamp(), lastBreakStart: null });
        } else {
            // START BREAK (Stop active task first)
            if (activeTask) await stopTask();
            await updateDoc(userRef, { onlineStatus: 'Break', lastSeen: serverTimestamp(), lastBreakStart: Date.now() });
        }
    } catch (error) {
        console.error("Break toggle failed:", error);
        alert("Failed to toggle break. Please check your connection.");
    } finally {
        setBreakLoading(false); // Re-enable button
    }
  };

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink 
      to={to} 
      className={({ isActive }) => 
        `flex items-center gap-3 px-5 py-3 mx-4 rounded-lg font-semibold transition-colors duration-200 cursor-pointer ${
          isActive ? 'bg-primary-light text-primary' : 'text-text-sec hover:bg-slate-100 hover:text-text-main'
        }`
      }
    >
      <Icon size={18} /> {label}
    </NavLink>
  );

  return (
    <div className="flex w-full h-screen bg-bg-body overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-[280px] bg-bg-surface border-r border-border flex flex-col z-20 shadow-sm">
        <div className="p-6 border-b border-border">
          <div className="font-extrabold text-xl text-primary flex items-center gap-2">
            <Zap size={24} fill="currentColor" /> TeamPulse
          </div>
          <div className="text-sm font-semibold text-text-sec mt-2 pl-8">{currentUser?.fullname}</div>
        </div>

        {/* --- BREAK BUTTON (With Loading Protection) --- */}
        {currentUser?.role !== 'ADMIN' && (
            <div className="px-4 pt-6 pb-2">
                <button 
                onClick={toggleBreak}
                disabled={breakLoading} // <--- PHYSICALLY DISABLE
                className={`w-full py-3 px-4 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-3 ${
                    breakLoading ? 'opacity-70 cursor-wait' : ''
                } ${
                    currentUser?.onlineStatus === 'Break' 
                    ? 'bg-amber-100 text-amber-800 border-2 border-amber-300 ring-2 ring-amber-50 shadow-inner'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-lg hover:scale-[1.02] active:scale-95'
                }`}
                >
                {breakLoading ? (
                    <>
                        <Loader2 size={20} className="animate-spin" /> 
                        <span className="text-sm">Processing...</span>
                    </>
                ) : currentUser?.onlineStatus === 'Break' ? (
                    <div className="text-center w-full">
                        <div className="text-[10px] uppercase tracking-widest opacity-80 mb-1 font-black">ON BREAK</div>
                        <div className="font-mono text-xl tabular-nums leading-none mb-1">
                            {formatDuration(breakElapsed)}
                        </div>
                        <div className="text-[10px] flex items-center justify-center gap-1 opacity-90">
                            <Play size={10} fill="currentColor"/> Click to Resume
                        </div>
                    </div>
                ) : (
                    <>
                        <Coffee size={20} strokeWidth={2.5} />
                        <span className="tracking-wide">Take a Break</span>
                    </>
                )}
                </button>
            </div>
        )}

        <div className="flex-1 py-4 overflow-y-auto no-scrollbar">
          {currentUser?.role === 'ADMIN' ? (
            <>
              <div className="px-6 text-xs font-extrabold text-text-sec mb-3 tracking-wider">MANAGEMENT</div>
              <NavItem to="/" icon={LayoutGrid} label="Dashboard" />
              <NavItem to="/meeting" icon={Presentation} label="Morning Standup" />
              <NavItem to="/users" icon={Users} label="Team" />
              <NavItem to="/projects" icon={FolderOpen} label="Projects" />
              <NavItem to="/leaves" icon={Calendar} label="Leave Requests" />
              <NavItem to="/resources" icon={BarChart3} label="Resource Plan" />
              <NavItem to="/game" icon={Gamepad2} label="Relax Zone" />

              <div className="px-6 text-xs font-extrabold text-text-sec mt-6 mb-3 tracking-wider">BUSINESS</div>
              <NavItem to="/crm" icon={Briefcase} label="CRM & Leads" />
              <NavItem to="/finance" icon={DollarSign} label="Invoicing" />
            </>
          ) : (
            <>
              <div className="px-6 text-xs font-extrabold text-text-sec mb-3 tracking-wider">YOUR WORK</div>
              <NavItem to="/" icon={CheckCircle} label="Today's Tasks" />
              <NavItem to="/leaves" icon={Calendar} label="My Leave" />
              <NavItem to="/history" icon={History} label="History Log" />
              <NavItem to="/game" icon={Gamepad2} label="Relax Zone" />
            </>
          )}
        </div>

        <div className="p-6 border-t border-border space-y-3">
          <button onClick={handlePasswordChange} className="btn btn-ghost w-full text-text-sec hover:bg-slate-100 justify-start pl-4">
            <Lock size={18} /> Change Pass
          </button>
          <button onClick={handleLogout} className="btn btn-ghost w-full text-danger hover:text-danger hover:bg-danger-bg justify-start pl-4">
            <LogOut size={18} /> Log Out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="h-16 bg-bg-surface border-b border-border px-8 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <h2 className="text-xl font-bold text-text-main">Workspace</h2>
          <div className="flex items-center gap-4">
            <div className="bg-bg-body px-3 py-1.5 rounded-lg border border-border flex items-center gap-2 hover:border-primary transition-colors focus-within:ring-2 ring-primary-light">
              <Calendar size={16} className="text-text-sec" />
              <input type="date" className="bg-transparent border-none outline-none text-sm font-semibold text-text-main cursor-pointer" value={globalDate} onChange={(e) => setGlobalDate(e.target.value)} />
            </div>
            {currentUser?.role === 'ADMIN' && (
                <button onClick={() => setIsModalOpen(true)} className="btn btn-primary shadow-md shadow-indigo-200"><Plus size={18} /> Assign Task</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 relative">
          <Outlet />
        </div>
        
        <GlobalTimerWidget />
      </div>
      <AssignTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}