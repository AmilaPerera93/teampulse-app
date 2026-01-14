import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Shield, AlertCircle } from 'lucide-react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const { loginWithToken, login, loading } = useAuth();
  const navigate = useNavigate();
  
  const [status, setStatus] = useState('Checking Security...');
  
  // FIXED: Default to true so the login form is visible to everyone immediately
  const [showAdminLogin, setShowAdminLogin] = useState(true);
  
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  // 1. AUTO-LOGIN WITH TOKEN
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
        setStatus("Verifying Secure Session...");
        loginWithToken(token).then(success => {
            if (success) navigate('/');
            else setStatus("Session Expired.");
        });
    }
  }, [searchParams]);

  const handleLogin = async (e) => {
      e.preventDefault();
      const success = await login(user, pass);  
      if (success) {
          navigate('/');
      }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-2xl w-full max-w-md shadow-xl border border-slate-100 flex flex-col items-center text-center">
        
        <div className="text-indigo-600 mb-6 animate-pulse">
            <Zap size={64} fill="currentColor" />
        </div>
        
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2">TeamPulse Secure</h1>

        <form onSubmit={handleLogin} className="w-full text-left mt-6">
            <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-xs mb-6 border border-amber-200 flex items-center gap-2">
                <AlertCircle size={14}/>
                <span><b>Emergency Web Login:</b> Tracker is currently offline.</span>
            </div>
            
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Username</label>
            <input 
                className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl mt-1 mb-4 focus:ring-2 ring-indigo-500 outline-none transition-all" 
                placeholder="Enter your username..." 
                value={user} onChange={e => setUser(e.target.value)} 
                required
            />

            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Password</label>
            <input 
                type="password" 
                className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl mt-1 mb-6 focus:ring-2 ring-indigo-500 outline-none transition-all" 
                placeholder="••••••••" 
                value={pass} onChange={e => setPass(e.target.value)} 
                required
            />

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all flex justify-center items-center" disabled={loading}>
                {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : 'Log In to TeamPulse'}
            </button>
        </form>

        <p className="mt-8 text-[10px] text-slate-400 font-mono uppercase tracking-widest">
            Cloud Infrastructure: Backup Mode
        </p>
      </div>
    </div>
  );
}