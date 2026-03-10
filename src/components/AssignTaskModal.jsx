import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { useDate } from '../contexts/DateContext';
import { X } from 'lucide-react';

export default function AssignTaskModal({ isOpen, onClose }) {
  const { globalDate } = useDate();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  
  // Form State
  const [assignedTo, setAssignedTo] = useState('');
  const [project, setProject] = useState('General');
  const [description, setDescription] = useState('');
  const [estHours, setEstHours] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    // Fetch Users & Projects when modal opens
    const fetchData = async () => {
      const userSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'MEMBER')));
      const projSnap = await getDocs(collection(db, 'projects'));
      
      setUsers(userSnap.docs.map(d => d.data()));
      setProjects(projSnap.docs.map(d => d.data()));
      
      // Seed default project if empty
      if (projSnap.empty) setProjects([{ name: 'General' }, { name: 'Internal' }]);
    };
    fetchData();
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assignedTo || !description) return;
    setLoading(true);

    try {
      await addDoc(collection(db, 'tasks'), {
        assignedTo,
        project,
        description,
        estHours: parseFloat(estHours) || 0,
        date: globalDate, // Assign to the CURRENTLY SELECTED date
        status: 'Todo',
        elapsedMs: 0,
        isRunning: false,
        lastStartTime: null,
        comments: []
      });
      onClose(); // Close modal
      setDescription(''); // Reset form
      setEstHours('');
    } catch (err) {
      alert("Error assigning task");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-sec hover:text-text-main">
            <X size={24} />
        </button>
        
        <h2 className="text-xl font-bold mb-6">Assign New Task</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-text-sec block mb-1">ASSIGNEE</label>
                    <select className="input-field mb-0" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} required>
                        <option value="" disabled>Select Member</option>
                        {users.map(u => <option key={u.username} value={u.fullname}>{u.fullname}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-text-sec block mb-1">PROJECT</label>
                    <select className="input-field mb-0" value={project} onChange={e => setProject(e.target.value)}>
                        {projects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        <option value="General">General</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-text-sec block mb-1">DESCRIPTION</label>
                <input type="text" className="input-field mb-0" placeholder="e.g. Fix Login Bug" 
                    value={description} onChange={e => setDescription(e.target.value)} required />
            </div>

            <div>
                <label className="text-xs font-bold text-text-sec block mb-1">EST. HOURS</label>
                <input type="number" className="input-field mb-0" placeholder="4" 
                    value={estHours} onChange={e => setEstHours(e.target.value)} />
            </div>

            <div className="flex gap-3 mt-6">
                <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={loading}>
                    {loading ? 'Assigning...' : 'Assign Task'}
                </button>
                <button type="button" onClick={onClose} className="btn btn-outline flex-1 justify-center">Cancel</button>
            </div>
        </form>
      </div>
    </div>
  );
}