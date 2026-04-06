// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { auth, db } from '../services/firebase';
import {
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, increment,
} from 'firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { ADMIN_EMAIL } from '../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

const POINTS = {
  POST_CREATE: 10,
  DAILY_LOGIN: 5,
  FIRST_POST: 50,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        await loadOrCreateProfile(firebaseUser);
        await checkDailyLogin(firebaseUser.uid);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ─── Daily login points ─────────────────────────────────────────────────────
  const checkDailyLogin = async (uid) => {
    try {
      const today = new Date().toDateString();
      const lastLogin = await AsyncStorage.getItem(`lastLogin_${uid}`);
      if (lastLogin !== today) {
        await AsyncStorage.setItem(`lastLogin_${uid}`, today);
        await updateDoc(doc(db, 'users', uid), {
          points: increment(POINTS.DAILY_LOGIN),
          lastLoginAt: serverTimestamp(),
        });
      }
    } catch (e) {}
  };

  // ─── Load or create user profile ────────────────────────────────────────────
  const loadOrCreateProfile = async (firebaseUser) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const data = snap.data();
        // Update last seen + sync Google photo if changed
        const updates = { lastSeen: serverTimestamp() };
        if (firebaseUser.photoURL && data.photoURL !== firebaseUser.photoURL) {
          updates.photoURL = firebaseUser.photoURL;
        }
        await updateDoc(userRef, updates);
        setProfile({ id: firebaseUser.uid, ...data, ...updates });
      } else {
        // First login — create profile
        const isAdminUser = firebaseUser.email === ADMIN_EMAIL;
        const newProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'Campus User',
          displayName: firebaseUser.displayName || 'Campus User',
          photoURL: firebaseUser.photoURL || '',
          username: generateUsername(firebaseUser.displayName || firebaseUser.email),
          bio: '',
          college: '',
          department: '',
          course: '',
          year: '',
          phone: '',
          socialLinks: { instagram: '', linkedin: '', twitter: '' },
          followers: [],
          following: [],
          followersCount: 0,
          followingCount: 0,
          savedPosts: [],
          role: isAdminUser ? 'admin' : 'user',
          isAdmin: isAdminUser,
          isVerified: false,
          isBanned: false,
          points: POINTS.FIRST_POST,
          postsCount: 0,
          reputation: 0,
          notificationsEnabled: true,
          fcmToken: null,
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        };

        await setDoc(userRef, newProfile);
        setProfile({ id: firebaseUser.uid, ...newProfile });
      }
    } catch (error) {
      console.error('[AuthContext] loadOrCreateProfile error:', error);
      // Fallback minimal profile so app doesn't crash
      setProfile({
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || 'User',
        displayName: firebaseUser.displayName || 'User',
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || '',
        role: firebaseUser.email === ADMIN_EMAIL ? 'admin' : 'user',
        isAdmin: firebaseUser.email === ADMIN_EMAIL,
        points: 0,
        postsCount: 0,
        savedPosts: [],
        followers: [],
        following: [],
        followersCount: 0,
        followingCount: 0,
      });
    }
  };

  // ─── Generate username ───────────────────────────────────────────────────────
  const generateUsername = (nameOrEmail) => {
    if (!nameOrEmail) return `user${Date.now()}`;
    const base = nameOrEmail
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 15);
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    return `${base || 'user'}${suffix}`;
  };

  // ─── Refresh profile from Firestore ─────────────────────────────────────────
  const refreshProfile = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        setProfile({ id: user.uid, ...snap.data() });
      }
    } catch (e) {
      console.error('[AuthContext] refreshProfile error:', e);
    }
  };

  // ─── Update profile ──────────────────────────────────────────────────────────
  const updateProfile = async (updates) => {
    if (!user) return { success: false, error: 'Not logged in' };
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => ({ ...prev, ...updates }));
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] updateProfile error:', error);
      return { success: false, error: error.message };
    }
  };

  // ─── Logout ──────────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      // v13 mein isSignedIn() remove ho gaya — getCurrentUser() use karo
      const currentUser = GoogleSignin.getCurrentUser();
      if (currentUser) {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      }
    } catch (e) {
      // Google signout fail hone par bhi Firebase signout hoga
      console.warn('[AuthContext] Google signout warning:', e);
    }
    try {
      await signOut(auth);
    } catch (error) {
      console.error('[AuthContext] Firebase signout error:', error);
      Alert.alert('Error', 'Sign out karne mein problem aayi. Dobara try karo.');
    }
  };

  // ─── isAdmin check — email based + role based ────────────────────────────────
  const isAdmin = profile?.role === 'admin' ||
    profile?.isAdmin === true ||
    user?.email === ADMIN_EMAIL;

  const isModerator = profile?.role === 'moderator' || isAdmin;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAdmin,
      isModerator,
      logout,
      updateProfile,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}