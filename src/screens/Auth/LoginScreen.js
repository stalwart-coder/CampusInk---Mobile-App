// src/screens/Auth/LoginScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../services/firebase';
import { useTheme } from '../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 1000;
const STORAGE_KEY_ATTEMPTS = '@campusink_login_attempts';
const STORAGE_KEY_LOCKOUT = '@campusink_login_lockout';

// ─── Google Sign-in configuration ──────────────────────────────────────────
GoogleSignin.configure({
  webClientId: '145682173197-oj0qs5o0fg1a7vv3s8do8ccd3gagg61e.apps.googleusercontent.com',
  offlineAccess: false,
  forceCodeForRefreshToken: false,
});

const getErrorMessage = (error) => {
  const code = error?.code || error?.message || '';
  if (code === statusCodes.SIGN_IN_CANCELLED) return null;
  if (code === statusCodes.IN_PROGRESS) return 'Sign-in pehle se chal rahi hai, thoda wait karo.';
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'Google Play Services available nahi hai. Please update karo.';
  if (code === 'auth/network-request-failed') return 'Network connection nahi hai. Internet check karo.';
  if (code === 'auth/user-disabled') return 'Yeh account block kar diya gaya hai.';
  if (code === 'auth/too-many-requests') return 'Bahut zyada attempts. Thodi der baad try karo.';
  if (code === 'auth/invalid-credential') return 'Google account se sign-in fail hua. Dobara try karo.';
  if (code === 'auth/account-exists-with-different-credential') return 'Yeh email pehle se doosre method se register hai.';
  if (code === '10' || code === 10) return 'Google Sign-in setup mein issue hai. App restart karo.';
  console.error('[LoginScreen] Error:', JSON.stringify(error));
  console.error('[LoginScreen] Error code:', error?.code);
  console.error('[LoginScreen] Error message:', error?.message);
  return 'Kuch galat hua. Dobara try karo.';
};

export default function LoginScreen() {
  const { theme, isDark } = useTheme();

  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslate = useRef(new Animated.Value(40)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const lockoutTimer = useRef(null);

  useEffect(() => {
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.delay(150),
      Animated.parallel([
        Animated.timing(contentTranslate, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    checkLockoutStatus();
    return () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); };
  }, []);

  const checkLockoutStatus = async () => {
    try {
      const lockoutUntil = await AsyncStorage.getItem(STORAGE_KEY_LOCKOUT);
      const storedAttempts = await AsyncStorage.getItem(STORAGE_KEY_ATTEMPTS);
      if (storedAttempts) setAttempts(parseInt(storedAttempts, 10));
      if (lockoutUntil) {
        const remaining = parseInt(lockoutUntil, 10) - Date.now();
        if (remaining > 0) {
          startLockoutCountdown(remaining);
        } else {
          await AsyncStorage.multiRemove([STORAGE_KEY_LOCKOUT, STORAGE_KEY_ATTEMPTS]);
          setAttempts(0);
        }
      }
    } catch (e) {}
  };

  const startLockoutCountdown = (remainingMs) => {
    setLockoutRemaining(Math.ceil(remainingMs / 1000));
    lockoutTimer.current = setInterval(async () => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(lockoutTimer.current);
          AsyncStorage.multiRemove([STORAGE_KEY_LOCKOUT, STORAGE_KEY_ATTEMPTS]);
          setAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const recordFailedAttempt = async () => {
    try {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      await AsyncStorage.setItem(STORAGE_KEY_ATTEMPTS, String(newAttempts));
      if (newAttempts >= MAX_ATTEMPTS) {
        const lockoutUntil = Date.now() + LOCKOUT_DURATION;
        await AsyncStorage.setItem(STORAGE_KEY_LOCKOUT, String(lockoutUntil));
        startLockoutCountdown(LOCKOUT_DURATION);
      }
    } catch (e) {}
  };

  const resetAttempts = async () => {
    try {
      await AsyncStorage.multiRemove([STORAGE_KEY_LOCKOUT, STORAGE_KEY_ATTEMPTS]);
      setAttempts(0);
    } catch (e) {}
  };

  const shakeButton = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const animatePress = (pressed) => {
    Animated.spring(btnScale, {
      toValue: pressed ? 0.96 : 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 5,
    }).start();
  };

  // ─── FIXED: Google Sign-in handler with Firebase credential ───────────────
  const handleGoogleSignIn = async () => {
    if (lockoutRemaining > 0) {
      setErrorMsg(`Bahut zyada attempts. ${lockoutRemaining}s baad try karo.`);
      shakeButton();
      return;
    }
    if (loading) return;

    setErrorMsg('');
    setLoading(true);

    try {
      // Step 1: Check Play Services
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Step 2: Sign in with Google — get idToken
      const signInResult = await GoogleSignin.signIn();

      // Step 3: Get idToken (handle both old and new SDK response format)
      let idToken = null;
      if (signInResult?.data?.idToken) {
        // New SDK format (v13+)
        idToken = signInResult.data.idToken;
      } else if (signInResult?.idToken) {
        // Old SDK format
        idToken = signInResult.idToken;
      }

      if (!idToken) {
        throw new Error('Google se idToken nahi mila. Dobara try karo.');
      }

      // Step 4: Create Firebase credential from Google idToken
      const googleCredential = GoogleAuthProvider.credential(idToken);

      // Step 5: Sign in to Firebase with Google credential
      await signInWithCredential(auth, googleCredential);

      // ✅ SUCCESS — AuthContext ka onAuthStateChanged automatically
      // user ko main app mein le jayega
      await resetAttempts();

    } catch (error) {
      const msg = getErrorMessage(error);
      if (msg) {
        if (error?.code !== statusCodes.SIGN_IN_CANCELLED) {
          await recordFailedAttempt();
        }
        setErrorMsg(msg);
        shakeButton();
      }
    } finally {
      setLoading(false);
    }
  };

  const isLocked = lockoutRemaining > 0;
  const attemptsLeft = MAX_ATTEMPTS - attempts;
  const showAttemptsWarning = attempts > 0 && attempts < MAX_ATTEMPTS && !isLocked;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <LinearGradient
        colors={isDark ? ['#0a0a0f', '#111827', '#0d1117'] : ['#f0f4ff', '#e8f0fe', '#f5f0ff']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={[styles.circle, styles.circleTop, { backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)' }]} />
      <View style={[styles.circle, styles.circleBottom, { backgroundColor: isDark ? 'rgba(139,92,246,0.10)' : 'rgba(139,92,246,0.07)' }]} />

      <View style={styles.content}>
        {/* Logo */}
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
          <View style={[styles.logoBox, isDark && styles.logoBoxDark]}>
            <Text style={styles.logoEmoji}>🎓</Text>
          </View>
          <Text style={[styles.appName, isDark && styles.textLight]}>CampusInk</Text>
          <Text style={[styles.tagline, isDark && styles.textMuted]}>College ka apna platform</Text>
        </Animated.View>

        {/* Card */}
        <Animated.View style={[styles.card, isDark && styles.cardDark, { transform: [{ translateY: contentTranslate }], opacity: contentOpacity }]}>
          <Text style={[styles.cardTitle, isDark && styles.textLight]}>Welcome! 👋</Text>
          <Text style={[styles.cardSubtitle, isDark && styles.textMuted]}>Google account se sign in karo</Text>

          {/* Error */}
          {errorMsg ? (
            <View style={[styles.errorBox, isDark && styles.errorBoxDark]}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Attempts warning */}
          {showAttemptsWarning && (
            <View style={[styles.warningBox, isDark && styles.warningBoxDark]}>
              <Text style={styles.warningText}>
                ⚠️ {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} bachi {attemptsLeft === 1 ? 'hai' : 'hain'}
              </Text>
            </View>
          )}

          {/* Lockout */}
          {isLocked && (
            <View style={[styles.lockBox, isDark && styles.lockBoxDark]}>
              <Text style={styles.lockIcon}>🔒</Text>
              <View>
                <Text style={[styles.lockTitle, isDark && styles.textLight]}>Account temporarily locked</Text>
                <Text style={styles.lockCountdown}>{lockoutRemaining}s baad try karo</Text>
              </View>
            </View>
          )}

          {/* Google Button */}
          <Animated.View style={[{ transform: [{ scale: btnScale }, { translateX: shakeAnim }] }, styles.btnWrapper]}>
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              onPressIn={() => animatePress(true)}
              onPressOut={() => animatePress(false)}
              disabled={loading || isLocked}
              style={[styles.googleBtn, isDark && styles.googleBtnDark, (loading || isLocked) && styles.googleBtnDisabled]}
              activeOpacity={1}
            >
              {loading ? (
                <ActivityIndicator size="small" color={isDark ? '#fff' : '#374151'} />
              ) : (
                <>
                  <GoogleIcon />
                  <Text style={[styles.googleBtnText, isDark && styles.textLight, isLocked && styles.disabledText]}>
                    {isLocked ? `Locked (${lockoutRemaining}s)` : 'Google se sign in karo'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.securityRow}>
            <Text style={[styles.securityText, isDark && styles.textMuted]}>🔐 Secure · Koi password nahi</Text>
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: contentOpacity }]}>
          <Text style={[styles.footerText, isDark && styles.textMuted]}>
            Sign in karke aap hamare{' '}
            <Text style={styles.footerLink}>Terms of Service</Text>
            {' '}aur{' '}
            <Text style={styles.footerLink}>Privacy Policy</Text>
            {' '}se agree karte ho.
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

function GoogleIcon() {
  return (
    <View style={googleIconStyles.container}>
      <Text style={googleIconStyles.text}>G</Text>
    </View>
  );
}

const googleIconStyles = StyleSheet.create({
  container: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  text: { fontSize: 13, fontWeight: '700', color: '#4285F4', lineHeight: 18 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  circle: { position: 'absolute', borderRadius: 999 },
  circleTop: { width: 320, height: 320, top: -100, right: -80 },
  circleBottom: { width: 280, height: 280, bottom: -80, left: -100 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 32 },
  logoContainer: { alignItems: 'center', marginBottom: 36 },
  logoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(99,102,241,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' },
  logoBoxDark: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.35)' },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 32, fontWeight: '700', color: '#111827', letterSpacing: -0.5, marginBottom: 4 },
  tagline: { fontSize: 15, color: '#6B7280' },
  card: { width: '100%', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 24, padding: 28, shadowColor: '#6366f1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8, borderWidth: 1, borderColor: 'rgba(99,102,241,0.12)' },
  cardDark: { backgroundColor: 'rgba(17,24,39,0.9)', borderColor: 'rgba(99,102,241,0.2)', shadowColor: '#000' },
  cardTitle: { fontSize: 22, fontWeight: '600', color: '#111827', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 16, gap: 8, borderWidth: 1, borderColor: '#FECACA' },
  errorBoxDark: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' },
  errorIcon: { fontSize: 14, lineHeight: 20 },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 20 },
  warningBox: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  warningBoxDark: { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' },
  warningText: { fontSize: 12, color: '#D97706', textAlign: 'center' },
  lockBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 14, padding: 14, marginBottom: 16, gap: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  lockBoxDark: { backgroundColor: 'rgba(55,65,81,0.7)', borderColor: 'rgba(75,85,99,0.5)' },
  lockIcon: { fontSize: 22 },
  lockTitle: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 2 },
  lockCountdown: { fontSize: 12, color: '#6B7280' },
  btnWrapper: { marginBottom: 16 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, borderWidth: 1.5, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, minHeight: 52 },
  googleBtnDark: { backgroundColor: 'rgba(55,65,81,0.8)', borderColor: 'rgba(99,102,241,0.3)' },
  googleBtnDisabled: { opacity: 0.6 },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: '#374151', letterSpacing: 0.1 },
  disabledText: { color: '#9CA3AF' },
  securityRow: { alignItems: 'center' },
  securityText: { fontSize: 12, color: '#9CA3AF' },
  footer: { marginTop: 24, paddingHorizontal: 8 },
  footerText: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16 },
  footerLink: { color: '#6366F1' },
  textLight: { color: '#F9FAFB' },
  textMuted: { color: '#9CA3AF' },
});