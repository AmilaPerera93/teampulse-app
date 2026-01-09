import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore'; // Added imports for fetching
import { X, Save, FolderOpen } from 'lucide-react';

export default function EditTaskModal({ isOpen, onClose, task }) {
  const [formData, setFormData] = useState({ description: '', project: '', estHours: 0 });
  const [projects, setProjects] = useState([]); // State to store project list
  const [loading, setLoading] = useState(false);

  // 1. Fetch Projects List on Mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const q = query(collection(db, 'projects'), orderBy('name')); // Assuming 'name' is the field
        const snapshot = await getDocs(q);
        const projList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProjects(projList);
      } catch (error) {
        console.error("Error fetching projects:", error);
      }
    };
    fetchProjects();
  }, []);

  // 2. Populate form when task data changes
  useEffect(() => {
    if (task) {
      setFormData({
        description: task.description || '',
        project: task.project || '', // This matches the project name text
        estHours: task.estHours || 0
      });
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, {
        description: formData.description,
        project: formData.project,
        estHours: parseFloat(formData.estHours)
      });
      onClose();
    } catch (error) {
      console.error("Error updating task:", error);
      alert("Failed to update task");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-700">Edit Task</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* DESCRIPTION INPUT */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Task Description</label>
            <input 
              type="text" 
              className="input-field w-full" 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              required
            />
          </div>

          {/* PROJECT SELECT DROPDOWN */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
            <div className="relative">
                <select 
                  className="input-field w-full appearance-none" 
                  value={formData.project}
                  onChange={(e) => setFormData({...formData, project: e.target.value})}
                  required
                >
                  <option value="" disabled>Select a Project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <FolderOpen size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* HOURS INPUT */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estimated Hours</label>
            <input 
              type="number" 
              step="0.5"
              className="input-field w-full" 
              value={formData.estHours}
              onChange={(e) => setFormData({...formData, estHours: e.target.value})}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              <Save size={16} className="mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}