import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  onSnapshot 
} from 'firebase/firestore'; 

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
  
  // A ref to prevent the "Logout Loop"
  const isLoggingOut = useRef(false);

  // --- REAL-TIME SYNC & SECURITY GUARD ---
  useEffect(() => {
    // Stop if no user, if it's the master admin, or if we are currently logging out
    if (!currentUser || !currentUser.id || currentUser.id === 'master' || isLoggingOut.current) return;

    // Listen to the user's record in real-time
    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
        // If we started logging out while the snapshot was in flight, ignore it
        if (isLoggingOut.current) return;

        if (docSnap.exists()) {
            const freshData = { id: docSnap.id, ...docSnap.data() };
            
            // 🚨 SECURITY GUARD (PATCHED) 🚨
            // Check if a MEMBER has lost their session token
            if (freshData.role !== 'ADMIN' && !freshData.sessionToken) {
                 console.warn("Security Alert: No Desktop Session detected. Terminating session.");
                 logout(); 
                 return;
            }

            // Normal Sync: Only update local state if data actually changed
            // Using JSON.stringify ensures we don't trigger re-renders for identical data
            if (JSON.stringify(freshData) !== JSON.stringify(currentUser)) {
                setCurrentUser(freshData);
                localStorage.setItem('teampulse_user', JSON.stringify(freshData));
            }
        } else {
            // User deleted from DB
            logout();
        }
    }, (error) => {
        console.error("Auth Listener Error:", error);
    });

    return () => unsub();
  }, [currentUser?.id]); // Only re-run if the User ID physically changes

  async function login(username, password) {
    setLoading(true);
    isLoggingOut.current = false; // Reset flag on login attempt
    
    // Master Admin Login
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
      
      // Block members from web login
      if (userData.role !== 'ADMIN') {
         alert("ACCESS DENIED: Team Members must use the Desktop App.");
         setLoading(false);
         return false;
      }

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

  async function loginWithToken(token) {
    setLoading(true);
    isLoggingOut.current = false;
    try {
        const q = query(collection(db, 'users'), where('sessionToken', '==', token));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { setLoading(false); return false; }

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

  async function logout() {
    // Set flag immediately to stop the onSnapshot loop
    isLoggingOut.current = true;

    if (currentUser && currentUser.id && currentUser.id !== 'master') {
      try {
        // 1. Pause any running tasks
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

        // 2. Clear Session in Database
        await updateDoc(doc(db, 'users', currentUser.id), {
          onlineStatus: 'Offline',
          lastSeen: serverTimestamp(),
          sessionToken: null 
        });

      } catch (e) { console.error("Logout Error:", e); }
    }
    
    // 3. Clean up local state
    localStorage.removeItem('teampulse_user');
    setCurrentUser(null);
  }

  const value = {
    currentUser,
    login,
    loginWithToken,
    logout,
    loading,
    resetUserPassword: async (uid, newPass) => {
        await updateDoc(doc(db, 'users', uid), { password: newPass });
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}