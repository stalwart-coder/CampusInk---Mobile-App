<div align="center">

<img src="https://img.shields.io/badge/Campus%20Ink-6366F1?style=for-the-badge&logo=react&logoColor=white" alt="Campus Ink" height="40"/>

# 🎓 Campus Ink

### *The Social Platform Built for College Life*

[![React Native](https://img.shields.io/badge/React%20Native-0.74.5-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-51.0.0-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev)
[![Firebase](https://img.shields.io/badge/Firebase-10.13.0-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-lightgrey?style=flat-square&logo=android)](https://expo.dev)

<br/>

> **Campus Ink** is a full-featured social media app designed exclusively for college students —  
> blogs, reels, groups, events, leaderboard, AI assistant, and more.  
> Think Instagram + Reddit + WhatsApp — but for your campus.

<br/>

---

</div>

## 📱 Screenshots

<div align="center">

| Feed | Reels | Groups | Profile |
|------|-------|--------|---------|
| 🏠 Campus Feed | 🎬 Instagram-style Reels | 👥 Private Groups | 👤 User Profile |
| Blog posts, trending topics | Vertical scroll, like/comment | Chat + Facebook-style posts | Banner, stats, achievements |

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 📰 Feed & Blog
- Rich post editor (Article, Question, Discussion)
- Formatting toolbar — Bold, Italic, H1, Bullet
- Category filters, mood picker
- Tags, cover image, read time
- Like, comment, save posts
- Search by title, author, tags

</td>
<td width="50%">

### 🎬 Reels
- Instagram-style vertical feed
- Video, Photo & Quote reels
- Smart mixed feed (not chronological)
- Double tap to like, single tap to pause
- Download to gallery
- Search by tags / college / keyword
- College filter

</td>
</tr>
<tr>
<td width="50%">

### 👥 Groups
- Create public / private groups
- Facebook-style group posts
- Text, Photo, Video, Question, Announcement
- Group chat with media support
- Join requests for private groups
- Tags, comments, likes on posts

</td>
<td width="50%">

### 🗓️ Events
- Create & manage campus events
- RSVP system with seat limits
- Category filters (Academic, Sports, Tech...)
- Past & upcoming events
- Registration links, prizes, entry fee

</td>
</tr>
<tr>
<td width="50%">

### 👤 Profile
- Banner + avatar upload
- Follow / Unfollow system
- Followers, Following, Points stats
- Dark mode support
- Privacy settings
- Block & Report users

</td>
<td width="50%">

### 🤖 AI Assistant
- Powered by GROQ (Llama 3)
- Study help, career advice, writing
- AI image generation
- Long press to copy responses
- Conversation history

</td>
</tr>
<tr>
<td width="50%">

### 🏆 Leaderboard
- Points-based ranking system
- Badges: Newcomer → Legend
- Weekly / All-time rankings
- College-wide competition

</td>
<td width="50%">

### 🔐 Auth & Security
- Google Sign-In
- Email/password auth
- Banned user detection
- Temp mail blocking
- Admin panel

</td>
</tr>
</table>

---

## 🏗️ Tech Stack

```
📱 Frontend          🔥 Backend           🤖 AI / Media
─────────────────    ─────────────────    ─────────────────
React Native 0.74    Firebase Auth        GROQ API (LLaMA 3)
Expo SDK 51          Firestore DB         Cloudinary (media)
React Navigation 6   Firebase Storage     expo-av (video)
Expo AV              Cloud Functions      expo-image-picker
LinearGradient       Push Notifications   expo-media-library
```

---

## 📁 Project Structure

```
CampusInkPro/
├── 📄 App.js                          # Root component
├── 📄 app.json                        # Expo config
├── 📄 firestore.rules                 # Security rules
│
└── 📂 src/
    ├── 📂 context/
    │   ├── AuthContext.js             # Auth + profile state
    │   └── ThemeContext.js            # Dark/light mode
    │
    ├── 📂 navigation/
    │   └── TabNavigator.js            # 5-tab navigation
    │
    ├── 📂 services/
    │   ├── firebase.js                # Firebase init
    │   ├── cloudinary.js              # Media upload
    │   ├── groq.js                    # AI service
    │   └── notifications.js           # Push notifications
    │
    ├── 📂 screens/
    │   ├── 📂 Auth/                   # Login screen
    │   ├── 📂 Feed/                   # Home feed
    │   ├── 📂 Post/                   # Write & detail
    │   ├── 📂 Reels/                  # Reels feed
    │   ├── 📂 Groups/                 # Groups + chat
    │   ├── 📂 Events/                 # Campus events
    │   ├── 📂 Leaderboard/            # Rankings
    │   ├── 📂 Profile/                # User profile + AI
    │   ├── 📂 Search/                 # Global search
    │   └── 📂 Admin/                  # Admin panel
    │
    ├── 📂 components/
    │   ├── post/PostCard.js
    │   └── ads/AdBanner.js
    │
    └── 📂 constants/
        └── index.js                   # App-wide constants
```

---

## 🚀 Getting Started

### Prerequisites

```bash
node >= 18
npm >= 9
expo-cli >= 5
Android Studio (for Android)
Xcode (for iOS — macOS only)
```

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/campusink.git
cd campusink
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment

Create a `google-services.json` in `android/app/` from your Firebase console.

Create a `.env` file:

```env
GROQ_API_KEY=your_groq_api_key
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_UPLOAD_PRESET=your_preset
```

### 4. Run on Android (USB Debugging)

```bash
npx expo run:android
```

### 5. Run on iOS

```bash
npx expo run:ios
```

---

## 🔥 Firebase Setup

### Firestore Collections

```
users/              → User profiles, followers, following
posts/              → Blog posts (global feed)
reels/              → Reels feed
  └── likes/        → Per-reel likes subcollection
  └── comments/     → Per-reel comments
groups/             → Group metadata
  └── members/      → Subcollection — {uid: role}
  └── posts/        → Group-only posts (private)
  └── messages/     → Group chat
events/             → Campus events
notifications/      → Push notification records
```

### Required Firestore Indexes

| Collection | Field 1 | Field 2 |
|------------|---------|---------|
| `posts` | `authorId` ↑ | `createdAt` ↓ |
| `posts` | `category` ↑ | `createdAt` ↓ |
| `reels` | `authorId` ↑ | `createdAt` ↓ |
| `notifications` | `userId` ↑ | `createdAt` ↓ |

---

## 📦 Key Dependencies

```json
{
  "expo": "~51.0.0",
  "react-native": "0.74.5",
  "firebase": "^10.13.0",
  "@react-native-google-signin/google-signin": "^13.1.0",
  "expo-av": "~14.0.7",
  "expo-image-picker": "~15.0.7",
  "expo-media-library": "~16.0.5",
  "expo-file-system": "~17.0.1",
  "expo-linear-gradient": "~13.0.2",
  "@react-navigation/native": "^6.1.18",
  "@react-navigation/bottom-tabs": "^6.6.1",
  "@react-navigation/stack": "^6.4.1",
  "moment": "^2.30.1"
}
```

---

## 🔑 Environment Variables

> ⚠️ **Never commit API keys to GitHub.** Add `.env` to `.gitignore`.

| Variable | Where to get |
|----------|-------------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `CLOUDINARY_CLOUD_NAME` | [cloudinary.com](https://cloudinary.com) |
| `CLOUDINARY_UPLOAD_PRESET` | Cloudinary dashboard → Settings → Upload |
| `FIREBASE_CONFIG` | Firebase console → Project settings |
| Google SHA-1 | `keytool -list -v -keystore ~/.android/debug.keystore` |

---

## 📲 Build & Deploy

### Generate APK (Android)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build APK for sharing
eas build --platform android --profile preview
```

### OTA Updates (No reinstall needed)

```bash
# Push update to users instantly
eas update --branch production --message "Bug fixes"
```

### Production Build

```bash
eas build --platform android --profile production
```

---

## 🛡️ Security

- Firestore rules restrict data access per user
- Group posts only visible to group members
- Blocked users cannot view profiles
- Temp mail addresses blocked at login
- Admin-only routes protected

---

## 🗺️ Roadmap

- [ ] Push notifications (FCM)
- [ ] Stories feature
- [ ] Poll / Quiz posts
- [ ] Campus marketplace
- [ ] Live streaming
- [ ] College verification badge
- [ ] iOS App Store release

---

## 🤝 Contributing

```bash
# Fork the repo
# Create your feature branch
git checkout -b feature/AmazingFeature

# Commit your changes
git commit -m 'Add AmazingFeature'

# Push to the branch
git push origin feature/AmazingFeature

# Open a Pull Request
```

---

## 📄 License

```
MIT License — free to use, modify and distribute.
```

---

<div align="center">

**Built with ❤️ for college students**

[![GitHub stars](https://img.shields.io/github/stars/YOUR_USERNAME/campusink?style=social)](https://github.com/YOUR_USERNAME/campusink)

*If this project helped you, please give it a ⭐*

</div>