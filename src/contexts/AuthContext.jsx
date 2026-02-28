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
  const isLoggingOut = useRef(false);

  useEffect(() => {
    if (!currentUser || !currentUser.id || currentUser.id === 'master' || isLoggingOut.current) return;

    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
        if (isLoggingOut.current) return;

        if (docSnap.exists()) {
            const freshData = { id: docSnap.id, ...docSnap.data() };
            
            // Fix: Added a check to ensure we don't logout while a login is in progress
            if (freshData.role !== 'ADMIN' && !freshData.sessionToken && !loading) {
                 console.warn("Security Alert: No Desktop Session detected.");
                 logout(); 
                 return;
            }

            if (JSON.stringify(freshData) !== JSON.stringify(currentUser)) {
                setCurrentUser(freshData);
                localStorage.setItem('teampulse_user', JSON.stringify(freshData));
            }
        } else {
            logout();
        }
    }, (error) => {
        console.error("Auth Listener Error:", error);
    });

    return () => unsub();
  }, [currentUser?.id, loading]); 

  async function login(username, password) {
    setLoading(true);
    isLoggingOut.current = false; 
    
    if (username === 'admin' && password === 'admin123') {
      const masterData = { fullname: 'Master Admin', username: 'admin', role: 'ADMIN', id: 'master' };
      setCurrentUser(masterData);
      localStorage.setItem('teampulse_user', JSON.stringify(masterData));
      setLoading(false);
      return true;
    }

    try {
      // Logic fix: Ensure we query based on the same field used in desktop
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
        
        if (snapshot.empty) { 
            console.error("Token validation failed in Firestore");
            setLoading(false); 
            return false; 
        }

        const docSnap = snapshot.docs[0];
        const userData = { id: docSnap.id, ...docSnap.data() };
        
        setCurrentUser(userData);
        localStorage.setItem('teampulse_user', JSON.stringify(userData));
        
        // Give the state a moment to settle before lifting the loading flag
        setTimeout(() => setLoading(false), 500);
        return true;
    } catch (e) {
        console.error("Token Login Error:", e);
        setLoading(false);
        return false;
    }
  }

  async function logout() {
    isLoggingOut.current = true;
    if (currentUser && currentUser.id && currentUser.id !== 'master') {
      try {
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
        await updateDoc(doc(db, 'users', currentUser.id), {
          onlineStatus: 'Offline',
          lastSeen: serverTimestamp(),
          sessionToken: null 
        });
      } catch (e) { console.error("Logout Error:", e); }
    }
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