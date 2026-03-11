import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { Trash2, UserPlus, Shield, User, KeyRound, AlertCircle, Briefcase } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function UsersManager() {
  const [users, setUsers] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { resetUserPassword } = useAuth();
  
  const [formData, setFormData] = useState({ fullname: '', username: '', password: '', role: 'MEMBER' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.fullname || !formData.username || !formData.password) {
        setError("All fields are required.");
        return;
    }
    
    setLoading(true);
    try {
        const q = query(collection(db, 'users'), where('username', '==', formData.username));
        const snap = await getDocs(q);
        if(!snap.empty) {
            setError("Username already taken.");
            setLoading(false);
            return;
        }

        await addDoc(collection(db, 'users'), {
            ...formData,
            createdAt: new Date().toISOString(),
            onlineStatus: 'Offline' 
        });
        
        setIsFormOpen(false);
        setFormData({ fullname: '', username: '', password: '', role: 'MEMBER' });
    } catch (err) {
        setError("Failed to create user.");
        console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async (id, name) => {
    if (confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)) {
      await deleteDoc(doc(db, 'users', id));
    }
  };

  const handleResetPassword = async (userId, userName) => {
      const newPass = prompt(`Enter a new password for ${userName}:`);
      if (newPass && newPass.length >= 6) {
          await resetUserPassword(userId, newPass);
          alert(`Password for ${userName} updated successfully.`);
      } else if (newPass) {
          alert("Password must be at least 6 characters.");
      }
  };

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Team Members</h2>
            <p className="text-sm text-slate-500">Manage access, roles, and credentials.</p>
        </div>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="btn btn-primary shadow-lg shadow-indigo-100">
            <UserPlus size={18} className="mr-2" /> Add Member
        </button>
      </div>

      {/* CREATE USER FORM */}
      {isFormOpen && (
        <div className="bg-white p-6 rounded-xl shadow-xl border border-slate-100 mb-8 animate-in slide-in-from-top-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            <h3 className="font-bold mb-4 text-slate-700">Create New Account</h3>
            
            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                    <AlertCircle size={16}/> {error}
                </div>
            )}

            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Full Name</label>
                    <input className="input-field" placeholder="e.g. John Doe" value={formData.fullname} onChange={e => setFormData({...formData, fullname: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Username</label>
                    <input className="input-field" placeholder="e.g. johnd" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Password</label>
                    <input className="input-field" type="text" placeholder="Min 6 chars" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Role</label>
                    <select className="input-field" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                        <option value="MEMBER">Team Member</option>
                        <option value="ADMIN">Administrator</option>
                        {/* ✅ ADDED: Coordinator Role */}
                        <option value="COORDINATOR">Coordinator</option> 
                    </select>
                </div>
                
                <div className="md:col-span-2 flex gap-3 mt-2 justify-end">
                    <button type="button" onClick={() => setIsFormOpen(false)} className="btn btn-ghost">Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-primary px-8">
                        {loading ? 'Creating...' : 'Create Account'}
                    </button>
                </div>
            </form>
        </div>
      )}

      {/* USERS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 tracking-wider">
                    <th className="p-4 font-bold">Member</th>
                    <th className="p-4 font-bold">Username</th>
                    <th className="p-4 font-bold">Role</th>
                    <th className="p-4 font-bold">Status</th>
                    <th className="p-4 font-bold text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="p-4 font-bold text-slate-700 flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 
                              ${u.role === 'ADMIN' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                                u.role === 'COORDINATOR' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {u.fullname.charAt(0)}
                            </div>
                            {u.fullname}
                        </td>
                        <td className="p-4 text-slate-500 font-mono text-sm">@{u.username}</td>
                        <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border 
                              ${u.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-100' : 
                                u.role === 'COORDINATOR' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                                'bg-white text-slate-600 border-slate-200'}`}>
                                {u.role === 'ADMIN' ? <Shield size={10}/> : 
                                 u.role === 'COORDINATOR' ? <Briefcase size={10}/> : <User size={10}/>} {u.role}
                            </span>
                        </td>
                        <td className="p-4">
                             <span className={`text-[10px] font-bold uppercase tracking-wide ${u.onlineStatus === 'Online' ? 'text-emerald-500' : u.onlineStatus === 'Idle' ? 'text-amber-500' : 'text-slate-400'}`}>
                                {u.onlineStatus || 'OFFLINE'}
                             </span>
                        </td>
                        <td className="p-4 text-right flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => handleResetPassword(u.id, u.fullname)} 
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Reset Password"
                            >
                                <KeyRound size={16}/>
                            </button>
                            <button 
                                onClick={() => handleDelete(u.id, u.fullname)} 
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete User"
                            >
                                <Trash2 size={16} />
                            </button>
                        </td>
                    </tr>
                ))}
                {users.length === 0 && (
                    <tr>
                        <td colSpan="5" className="p-10 text-center text-slate-400 italic">No users found. Create one to get started.</td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
}