import React, { createContext, useState, useContext, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'; 

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('teampulse_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false);

  // --- REAL-TIME SYNC ---
  // Keeps the web user updated if the Electron app changes their status (e.g. to Idle)
  useEffect(() => {
    if (!currentUser || !currentUser.id || currentUser.id === 'master') return;

    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
        if (docSnap.exists()) {
            const freshData = { id: docSnap.id, ...docSnap.data() };
            // Update local state if DB changes
            if (JSON.stringify(freshData) !== JSON.stringify(currentUser)) {
                setCurrentUser(freshData);
                localStorage.setItem('teampulse_user', JSON.stringify(freshData));
            }
        }
    });
    return () => unsub();
  }, [currentUser?.id]);

  // --- LOGIN ---
  async function login(username, password) {
    setLoading(true);
    
    // Master Admin
    if (username === 'admin' && password === 'admin123') {
      const masterData = { fullname: 'Master Admin', username: 'admin', role: 'ADMIN', id: 'master' };
      setCurrentUser(masterData);
      localStorage.setItem('teampulse_user', JSON.stringify(masterData));
      setLoading(false);
      return true;
    }

    try {
      const q = query(
        collection(db, 'users'),
        where('username', '==', username),
        where('password', '==', password)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert("Invalid Username or Password");
        setLoading(false);
        return false;
      }

      const docSnap = querySnapshot.docs[0];
      const userData = { id: docSnap.id, ...docSnap.data() };
      
      // ADMINS ONLY on Web
      if (userData.role !== 'ADMIN') {
          alert("ACCESS DENIED: Please use the Desktop Tracker app.");
          setLoading(false);
          return false;
      }

      // Mark Admin Online
      await updateDoc(doc(db, 'users', docSnap.id), {
        onlineStatus: 'Online',
        lastSeen: serverTimestamp()
      });

      setCurrentUser(userData);
      localStorage.setItem('teampulse_user', JSON.stringify(userData));
      setLoading(false);
      return true;
    } catch (error) {
      console.error("Login error:", error);
      setLoading(false);
      return false;
    }
  }

  // --- TOKEN LOGIN ---
  async function loginWithToken(token) {
    setLoading(true);
    try {
        const q = query(collection(db, 'users'), where('sessionToken', '==', token));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            setLoading(false);
            return false;
        }

        const docSnap = snapshot.docs[0];
        const userData = { id: docSnap.id, ...docSnap.data() };
        
        setCurrentUser(userData);
        localStorage.setItem('teampulse_user', JSON.stringify(userData));
        setLoading(false);
        return true;
    } catch (e) {
        setLoading(false);
        return false;
    }
  }

  // --- LOGOUT (The Heavy Lifter) ---
  async function logout() {
    if (currentUser && currentUser.id && currentUser.id !== 'master') {
      try {
        // 1. PAUSE ALL RUNNING TASKS
        // This ensures tasks don't run forever if user clocks out
        const qRunning = query(
            collection(db, 'tasks'), 
            where('assignedTo', '==', currentUser.fullname), 
            where('isRunning', '==', true)
        );
        const runningSnap = await getDocs(qRunning);
        
        const updates = runningSnap.docs.map(tDoc => {
             const tData = tDoc.data();
             const elapsed = tData.elapsedMs || 0;
             const session = tData.lastStartTime ? (Date.now() - tData.lastStartTime) : 0;
             
             return updateDoc(doc(db, 'tasks', tDoc.id), {
                 isRunning: false,
                 lastStartTime: null,
                 elapsedMs: elapsed + session
             });
        });
        await Promise.all(updates);

        // 2. KILL ELECTRON SESSION & MARK OFFLINE
        await updateDoc(doc(db, 'users', currentUser.id), {
          onlineStatus: 'Offline',
          lastSeen: serverTimestamp(),
          sessionToken: null // <--- This triggers Electron to logout
        });

      } catch (e) { console.error("Logout Cleanup Error:", e); }
    }
    
    // 3. Local Cleanup
    localStorage.removeItem('teampulse_user');
    setCurrentUser(null);
  }

  const value = {
    currentUser,
    login,
    loginWithToken,
    logout,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}