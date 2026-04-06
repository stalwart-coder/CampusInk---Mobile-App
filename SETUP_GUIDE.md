# CampusInk — Setup & Integration Guide

## Step 1: Install Required Package

Reels ke liye `expo-av` install karo (agar pehle se nahi hai):

```bash
npx expo install expo-av
```

## Step 2: File Placement

Neeche diye gaye files ko apne project mein copy karo:

```
campusink_final/
├── App.js                              → CampusInkPro/App.js               (REPLACE)
├── app.json                            → CampusInkPro/app.json              (REPLACE)
├── firestore.rules                     → CampusInkPro/firestore.rules       (REPLACE)
└── src/
    ├── constants/index.js              → src/constants/index.js             (REPLACE)
    ├── context/AuthContext.js          → src/context/AuthContext.js         (REPLACE)
    ├── navigation/TabNavigator.js      → src/navigation/TabNavigator.js     (REPLACE)
    ├── services/cloudinary.js          → src/services/cloudinary.js         (REPLACE)
    └── screens/
        ├── Auth/LoginScreen.js         → src/screens/Auth/LoginScreen.js    (REPLACE)
        ├── Groups/GroupsScreen.js      → src/screens/Groups/GroupsScreen.js (REPLACE)
        ├── Groups/GroupSettingsScreen.js → src/screens/Groups/             (NEW FILE)
        ├── Reels/ReelsScreen.js        → src/screens/Reels/               (NEW FOLDER + FILE)
        └── Admin/AdsScreen.js          → src/screens/Admin/               (NEW FILE)
```

## Step 3: Google Sign-In Setup (REQUIRED)

### 3a. Firebase Console mein Google Auth enable karo:
1. https://console.firebase.google.com → blog-website-dde49
2. Authentication → Sign-in method → Google → Enable
3. **Web client ID copy karo** (looks like: 743827641563-xxxxx.apps.googleusercontent.com)

### 3b. LoginScreen.js mein ID paste karo:
```javascript
// src/screens/Auth/LoginScreen.js line ~24
GoogleSignin.configure({
  webClientId: 'PASTE_YOUR_WEB_CLIENT_ID_HERE',  // ← yahan paste karo
  offlineAccess: false,
});
```

### 3c. Android ke liye google-services.json:
1. Firebase Console → Project Settings → Android app → google-services.json download karo
2. `CampusInkPro/` root mein rakh do

## Step 4: Firestore Deploy

```bash
# Firebase CLI install (agar nahi hai)
npm install -g firebase-tools

# Login
firebase login

# Deploy rules
firebase deploy --only firestore:rules
```

## Step 5: Groq API Key Fix

`src/constants/index.js` mein GROQ_API_KEY fix karo:
1. https://console.groq.com → API Keys → Create new key
2. Key "gsk_" se start hogi
3. Replace karo:
```javascript
export const GROQ_API_KEY = 'gsk_YOUR_ACTUAL_KEY_HERE';
```

## Step 6: Firestore Composite Indexes

Firebase Console → Firestore → Indexes → Add index:

| Collection | Field 1 | Field 2 | Order |
|-----------|---------|---------|-------|
| posts | category | createdAt DESC | Ascending + Descending |
| notifications | userId | createdAt DESC | Ascending + Descending |
| posts | authorId | createdAt DESC | Ascending + Descending |
| reels | authorId | createdAt DESC | Ascending + Descending |

## Step 7: Admin Account Set Karo

Apna account admin banane ke liye Firestore mein jaake:
`users/{your-uid}` document mein `role: "admin"` set karo

## What's New

### ✅ Phase 1 — Auth
- Google Sign-in only (clean, secure)
- Rate limiting: 5 failed attempts → 30s lockout
- Human-readable Hindi/English error messages
- Dark mode support

### ✅ Phase 2 — Groups Overhaul
- Public + Private groups
- Private group join request system (admin approve/reject)
- GroupSettingsScreen: member management, edit info
- Real-time join status tracking

### ✅ Phase 3 — Reels
- Vertical scrolling reel feed (TikTok style)
- 3 types: Short Video (60s), Photo, Text/Quote
- 6 gradient backgrounds for quote reels
- Like, comment, share
- Upload modal with media picker

### ✅ Phase 4 — Ads Management
- 4 ad types: Banner, Video, Sponsored Post, Story
- Stats: impressions, clicks, CTR
- Activate/Pause/Delete controls
- Target by college

### ✅ Firestore Security Rules
- Complete rules for all collections
- Reels, Stories, Ads, Boost, Follow system included
- Anonymous users blocked (Google auth only)
