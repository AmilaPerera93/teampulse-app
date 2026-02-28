import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Zap, Download, Shield } from 'lucide-react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const { loginWithToken, login, loading } = useAuth();
  const navigate = useNavigate();
  
  const [status, setStatus] = useState('Checking Security...');
  
  // RESTORED: Default is FALSE so members see the "Download" prompt
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  
  // Admin Form State
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');

  // 1. AUTO-LOGIN WITH TOKEN (From Electron App)
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
        setStatus("Verifying Secure Session...");
        loginWithToken(token).then(success => {
            if (success) {
                navigate('/');
            } else {
                setStatus("Session Expired. Please restart the Desktop App.");
            }
        });
    } else {
        setStatus("Waiting for Desktop App...");
    }
  }, [searchParams]);

  // 2. ADMIN LOGIN HANDLER
  const handleAdminLogin = async (e) => {
      e.preventDefault();
      const success = await login(adminUser, adminPass);  
      if (success) {
          navigate('/');  
      }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-2xl w-full max-w-md shadow-xl border border-slate-100 flex flex-col items-center text-center">
        
        <div className="text-primary mb-6 animate-pulse">
            <Zap size={64} fill="currentColor" />
        </div>
        
        <h1 className="text-3xl font-extrabold text-slate-800 mb-2">TeamPulse Secure</h1>

        {/* --- SCENARIO A: NORMAL MEMBER (NO TOKEN) --- */}
        {!searchParams.get('token') && !showAdminLogin && (
            <div className="w-full mt-4">
                <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm font-medium mb-6">
                    ⚠️ Direct web login is disabled for security tracking.
                </div>
                
                <p className="text-slate-500 mb-8">
                    Please open the <b>TeamPulse Agent</b> on your desktop to log in automatically.
                </p>

                <button className="btn btn-primary w-full justify-center py-4 text-lg shadow-lg shadow-indigo-200 hover:scale-[1.02] transition-transform">
                    <Download size={20} className="mr-2"/> Download Agent
                </button>

                <button 
                    onClick={() => setShowAdminLogin(true)}
                    className="mt-8 text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 w-full"
                >
                    <Shield size={12}/> Admin Access
                </button>
            </div>
        )}

        {/* --- SCENARIO B: VERIFYING TOKEN --- */}
        {searchParams.get('token') && (
            <div className="mt-8 flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-semibold text-slate-600">{status}</p>
            </div>
        )}

        {/* --- SCENARIO C: ADMIN LOGIN FORM --- */}
        {showAdminLogin && (
            <form onSubmit={handleAdminLogin} className="w-full text-left mt-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-700">Admin Login</h3>
                    <button type="button" onClick={() => setShowAdminLogin(false)} className="text-xs text-primary">Cancel</button>
                </div>
                
                <input 
                    className="input-field mb-3" 
                    placeholder="Admin Username" 
                    value={adminUser} onChange={e => setAdminUser(e.target.value)} 
                />
                <input 
                    type="password" className="input-field" 
                    placeholder="Password" 
                    value={adminPass} onChange={e => setAdminPass(e.target.value)} 
                />

                <button type="submit" className="btn btn-primary w-full justify-center mt-4" disabled={loading}>
                    {loading ? 'Verifying...' : 'Access Dashboard'}
                </button>
            </form>
        )}

      </div>
    </div>
  );
}