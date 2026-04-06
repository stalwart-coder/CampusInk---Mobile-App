// src/constants/index.js
// ⚠️  GROQ_API_KEY: https://console.groq.com se "gsk_..." wali key lo
// ⚠️  LoginScreen.js mein webClientId: Firebase Console → Auth → Google → Web client ID

export const ADMIN_EMAIL = 'palbipin324@gmail.com';
export const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';
 // console.groq.com

export const CLOUDINARY = {
  cloud: 'dzoerueun',
  preset: 'blog_uploads',
  uploadUrl: 'https://api.cloudinary.com/v1_1/dzoerueun/image/upload',
};

export const COLORS = {
  light: {
    primary: '#6366F1', primaryDark: '#4F46E5', secondary: '#EC4899',
    accent: '#10B981', background: '#F9FAFB', surface: '#FFFFFF',
    card: '#FFFFFF', text: '#111827', textSecondary: '#6B7280',
    border: '#E5E7EB', error: '#EF4444', success: '#10B981', warning: '#F59E0B',
    tabBar: '#FFFFFF', tabBarBorder: '#E5E7EB', inputBg: '#F3F4F6',
    badge: '#EF4444', overlay: 'rgba(0,0,0,0.5)', skeleton: '#E5E7EB',
  },
  dark: {
    primary: '#818CF8', primaryDark: '#6366F1', secondary: '#F472B6',
    accent: '#34D399', background: '#0a0a0f', surface: '#111827',
    card: '#111827', text: '#F9FAFB', textSecondary: '#9CA3AF',
    border: '#1f2937', error: '#F87171', success: '#34D399', warning: '#FBBF24',
    tabBar: '#0d1117', tabBarBorder: '#1f2937', inputBg: '#1f2937',
    badge: '#F87171', overlay: 'rgba(0,0,0,0.7)', skeleton: '#1f2937',
  },
};

export const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🌟', color: '#6366F1' },
  { id: 'technology', label: 'Technology', icon: '💻', color: '#10B981' },
  { id: 'design', label: 'Design', icon: '🎨', color: '#EC4899' },
  { id: 'business', label: 'Business', icon: '💼', color: '#F59E0B' },
  { id: 'science', label: 'Science', icon: '🔬', color: '#3B82F6' },
  { id: 'arts', label: 'Arts', icon: '🎭', color: '#EF4444' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: '#8B5CF6' },
  { id: 'campus', label: 'Campus', icon: '🏫', color: '#6366F1' },
  { id: 'humor', label: 'Humor', icon: '😂', color: '#F59E0B' },
  { id: 'news', label: 'News', icon: '📰', color: '#EF4444' },
];

export const LEADERBOARD_BADGES = [
  { min: 0, badge: '🌱 Seedling', color: '#10B981' },
  { min: 100, badge: '⭐ Rising Star', color: '#F59E0B' },
  { min: 500, badge: '🔥 Blazer', color: '#EF4444' },
  { min: 1000, badge: '💎 Diamond', color: '#3B82F6' },
  { min: 5000, badge: '👑 Legend', color: '#6366F1' },
];

export const POINTS = {
  POST_CREATE: 10, POST_LIKE_RECEIVED: 1, COMMENT_CREATE: 2,
  COMMENT_RECEIVED: 1, DAILY_LOGIN: 5, PROFILE_COMPLETE: 20,
  FIRST_POST: 50, REEL_CREATE: 15, REEL_LIKE_RECEIVED: 1,
};

export const REPORT_REASONS = [
  'Spam or misleading', 'Hate speech or harassment',
  'Inappropriate content', 'Violence or dangerous',
  'Copyright violation', 'Other',
];
