// src/screens/Profile/ProfileScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, TextInput, Alert, ActivityIndicator, Switch,
  FlatList, Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import { doc, updateDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { uploadImage } from '../../services/cloudinary';
import { LEADERBOARD_BADGES } from '../../constants';
import PostCard from '../../components/post/PostCard';

const { width: W } = Dimensions.get('window');
const REEL_SIZE = (W - 3) / 3;

// ── Shuffle helper ────────────────────────────────────────────────────────────
const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default function ProfileScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, profile, logout, refreshProfile, isAdmin } = useAuth();

  const [tab, setTab] = useState('blogs');
  const [myBlogs, setMyBlogs]   = useState([]);
  const [myReels, setMyReels]   = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [uploadingPhoto, setUploadingPhoto]   = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [loadingContent, setLoadingContent]   = useState(false);

  const [form, setForm] = useState({
    name:           profile?.name || '',
    bio:            profile?.bio || '',
    department:     profile?.department || '',
    year:           profile?.year || '',
    phone:          profile?.phone || '',
    college:        profile?.college || '',
    instagram:      profile?.socialLinks?.instagram || '',
    linkedin:       profile?.socialLinks?.linkedin || '',
    twitter:        profile?.socialLinks?.twitter || '',
    hideEmail:      profile?.privacy?.hideEmail || false,
    hidePhone:      profile?.privacy?.hidePhone || false,
    hideFollowers:  profile?.privacy?.hideFollowers || false,
    privateAccount: profile?.privacy?.privateAccount || false,
  });

  // ── Fetch blogs (shuffled) ────────────────────────────────────────────────
  const fetchMyBlogs = useCallback(async () => {
    if (!user) return;
    setLoadingContent(true);
    try {
      const q = query(
        collection(db, 'posts'),
        where('authorId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const blogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyBlogs(shuffleArray(blogs)); // ← random order every time
    } catch (e) {
      console.error('fetchMyBlogs:', e);
    } finally {
      setLoadingContent(false);
    }
  }, [user]);

  // ── Fetch reels ───────────────────────────────────────────────────────────
  const fetchMyReels = useCallback(async () => {
    if (!user) return;
    setLoadingContent(true);
    try {
      // ── FIX: Fetch ONLY this user's reels — no global state reuse ────────
      const q = query(
        collection(db, 'reels'),
        where('authorId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      // Fresh isolated state — never shares with global reels feed
      setMyReels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      // If index missing, fallback without orderBy
      try {
        const q2 = query(
          collection(db, 'reels'),
          where('authorId', '==', user.uid)
        );
        const snap2 = await getDocs(q2);
        const sorted = snap2.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setMyReels(sorted);
      } catch (e2) {
        console.error('fetchMyReels:', e2);
      }
    } finally {
      setLoadingContent(false);
    }
  }, [user]);

  // ── Fetch saved posts ─────────────────────────────────────────────────────
  const fetchSavedPosts = useCallback(async () => {
    if (!profile?.savedPosts?.length) { setSavedPosts([]); return; }
    setLoadingContent(true);
    try {
      const q = query(
        collection(db, 'posts'),
        where('__name__', 'in', profile.savedPosts.slice(0, 10))
      );
      const snap = await getDocs(q);
      setSavedPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('fetchSavedPosts:', e);
    } finally {
      setLoadingContent(false);
    }
  }, [profile?.savedPosts]);

  useEffect(() => {
    if (tab === 'blogs')  fetchMyBlogs();
    else if (tab === 'reels')  fetchMyReels();
    else if (tab === 'saved')  fetchSavedPosts();
  }, [tab]);

  const badge = LEADERBOARD_BADGES.slice().reverse().find(
    b => (profile?.points || 0) >= b.min
  );

  // ── Photo upload ──────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8, allowsEditing: true, aspect: [1, 1],
    });
    if (result.canceled) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      await refreshProfile();
      Alert.alert('✅', 'Profile photo updated!');
    } catch { Alert.alert('Error', 'Failed to upload photo'); }
    finally { setUploadingPhoto(false); }
  };

  const pickBanner = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85, allowsEditing: true, aspect: [3, 1],
    });
    if (result.canceled) return;
    setUploadingBanner(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      await updateDoc(doc(db, 'users', user.uid), { bannerURL: url });
      await refreshProfile();
      Alert.alert('✅', 'Banner updated!');
    } catch { Alert.alert('Error', 'Failed to upload banner'); }
    finally { setUploadingBanner(false); }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) { Alert.alert('Error', 'Name cannot be empty'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name: form.name.trim(),
        bio: form.bio.trim(),
        department: form.department.trim(),
        year: form.year.trim(),
        phone: form.phone.trim(),
        college: form.college.trim(),
        socialLinks: {
          instagram: form.instagram.trim(),
          linkedin: form.linkedin.trim(),
          twitter: form.twitter.trim(),
        },
        privacy: {
          hideEmail: form.hideEmail,
          hidePhone: form.hidePhone,
          hideFollowers: form.hideFollowers,
          privateAccount: form.privateAccount,
        },
      });
      await refreshProfile();
      setEditing(false);
      Alert.alert('✅ Saved', 'Profile updated!');
    } catch { Alert.alert('Error', 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const stats = [
    { label: 'Blogs',     value: myBlogs.length || profile?.postsCount || 0 },
    { label: 'Points',    value: profile?.points || 0 },
    { label: 'Followers', value: profile?.followersCount || 0 },
    { label: 'Following', value: profile?.followingCount || 0 },
  ];

  const TABS = [
    { id: 'blogs',    label: 'Blogs',    icon: 'document-text-outline' },
    { id: 'reels',    label: 'Reels',    icon: 'play-circle-outline' },
    { id: 'saved',    label: 'Saved',    icon: 'bookmark-outline' },
    { id: 'settings', label: 'Settings', icon: 'settings-outline' },
  ];

  // ── Reel grid item ────────────────────────────────────────────────────────
  const renderReelItem = ({ item, index }) => (
    <TouchableOpacity
      style={S.reelThumb}
      onPress={() => navigation.navigate('ProfileReels', {
        reels: myReels,       // pass ONLY this user's reels
        startIndex: index,    // start from clicked reel
        userId: user?.uid,
      })}
      activeOpacity={0.8}
    >
      {item.mediaUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl || item.mediaUrl }}
          style={S.reelThumbImg}
          resizeMode="cover"
        />
      ) : (
        <View style={[S.reelThumbImg, { backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', padding: 8 }]}>
          <Text style={{ color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' }} numberOfLines={3}>
            {item.quoteText || '💬'}
          </Text>
        </View>
      )}
      {item.type === 'video' && (
        <View style={S.reelPlayIcon}>
          <Ionicons name="play" size={10} color="#fff" />
        </View>
      )}
      <View style={S.reelLikes}>
        <Ionicons name="heart" size={11} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
          {item.likesCount || 0}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={[S.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Banner ── */}
      <TouchableOpacity style={S.bannerContainer} onPress={pickBanner} activeOpacity={0.9}>
        {uploadingBanner ? (
          <View style={[S.banner, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator color="#FFF" />
            <Text style={{ color: '#FFF', marginTop: 6, fontSize: 12 }}>Uploading...</Text>
          </View>
        ) : profile?.bannerURL ? (
          <Image source={{ uri: profile.bannerURL }} style={S.banner} resizeMode="cover" />
        ) : (
          <View style={[S.banner, { backgroundColor: colors.primary }]}>
            <View style={S.bannerEditHint}>
              <Ionicons name="camera" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>Tap to add banner</Text>
            </View>
          </View>
        )}
        <View style={S.bannerTopRow}>
          {isAdmin && (
            <TouchableOpacity style={S.chip} onPress={() => navigation.navigate('Admin')}>
              <Ionicons name="shield-checkmark" size={13} color="#FFF" />
              <Text style={S.chipText}>Admin</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={S.chip} onPress={() => setEditing(!editing)}>
            <Ionicons name={editing ? 'close' : 'create-outline'} size={13} color="#FFF" />
            <Text style={S.chipText}>{editing ? 'Cancel' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* ── Avatar & quick actions ── */}
      <View style={[S.profileTop, { backgroundColor: colors.background }]}>
        <View style={S.avatarRow}>
          <TouchableOpacity style={S.avatarWrapper} onPress={pickPhoto} disabled={uploadingPhoto}>
            {uploadingPhoto ? (
              <View style={[S.avatar, { backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : profile?.photoURL ? (
              <Image source={{ uri: profile.photoURL }} style={S.avatar} />
            ) : (
              <View style={[S.avatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 32, color: '#FFF', fontWeight: '800' }}>
                  {(profile?.name || 'U')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={S.cameraBtn}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>

          <View style={S.quickBtns}>
            <TouchableOpacity
              style={[S.quickBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('AIAssistant')}
            >
              <Ionicons name="sparkles" size={15} color="#FFF" />
              <Text style={S.quickBtnTxt}>AI Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.quickBtn, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={15} color={colors.text} />
              <Text style={[S.quickBtnTxt, { color: colors.text }]}>Alerts</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[S.name, { color: colors.text }]}>{profile?.name || 'Campus User'}</Text>
        {profile?.username && (
          <Text style={[S.handle, { color: colors.textSecondary }]}>@{profile.username}</Text>
        )}
        {profile?.department && (
          <Text style={[S.dept, { color: colors.textSecondary }]}>
            {profile.department}{profile.year ? ` · ${profile.year}` : ''}
          </Text>
        )}
        {badge && (
          <View style={[S.badgePill, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[S.badgeTxt, { color: colors.primary }]}>{badge.badge}</Text>
          </View>
        )}
        {profile?.bio && !editing && (
          <Text style={[S.bio, { color: colors.text }]}>{profile.bio}</Text>
        )}
      </View>

      {/* ── Stats ── */}
      <View style={[S.statsRow, { backgroundColor: colors.card }]}>
        {stats.map((s, i) => (
          <View
            key={i}
            style={[S.statItem, i < 3 && { borderRightWidth: 1, borderRightColor: colors.border }]}
          >
            <Text style={[S.statValue, { color: colors.text }]}>
              {s.value >= 1000 ? `${(s.value / 1000).toFixed(1)}k` : s.value}
            </Text>
            <Text style={[S.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Edit Form ── */}
      {editing && (
        <View style={[S.editCard, { backgroundColor: colors.card }]}>
          <Text style={[S.editTitle, { color: colors.text }]}>✏️ Edit Profile</Text>
          {[
            { key: 'name',       placeholder: 'Full Name *',            icon: 'person-outline' },
            { key: 'college',    placeholder: 'College / University',    icon: 'business-outline' },
            { key: 'department', placeholder: 'Department',              icon: 'school-outline' },
            { key: 'year',       placeholder: 'Year (e.g. 3rd Year)',    icon: 'calendar-outline' },
            { key: 'phone',      placeholder: 'Phone Number',            icon: 'call-outline' },
          ].map(f => (
            <View key={f.key} style={[S.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name={f.icon} size={16} color={colors.textSecondary} />
              <TextInput
                style={[S.inputField, { color: colors.text }]}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textSecondary}
                value={form[f.key]}
                onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
              />
            </View>
          ))}
          <View style={[S.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, alignItems: 'flex-start', paddingTop: 12 }]}>
            <Ionicons name="create-outline" size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
            <TextInput
              style={[S.inputField, { color: colors.text, minHeight: 80 }]}
              placeholder="Bio"
              placeholderTextColor={colors.textSecondary}
              value={form.bio}
              onChangeText={v => setForm(p => ({ ...p, bio: v }))}
              multiline textAlignVertical="top" maxLength={200}
            />
          </View>
          <Text style={[S.sectionLabel, { color: colors.textSecondary }]}>🔗 Social Links</Text>
          {[
            { key: 'instagram', placeholder: 'Instagram username', icon: 'logo-instagram' },
            { key: 'linkedin',  placeholder: 'LinkedIn username',  icon: 'logo-linkedin' },
            { key: 'twitter',   placeholder: 'Twitter / X username', icon: 'logo-twitter' },
          ].map(f => (
            <View key={f.key} style={[S.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name={f.icon} size={16} color={colors.textSecondary} />
              <TextInput
                style={[S.inputField, { color: colors.text }]}
                placeholder={f.placeholder}
                placeholderTextColor={colors.textSecondary}
                value={form[f.key]}
                onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                autoCapitalize="none"
              />
            </View>
          ))}
          <TouchableOpacity
            style={[S.saveBtn, { backgroundColor: colors.primary }]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#FFF" />
              : <Text style={S.saveBtnTxt}>Save Changes</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── Tabs ── */}
      <View style={[S.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[S.tabItem, tab === t.id && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}
            onPress={() => setTab(t.id)}
          >
            <Ionicons name={t.icon} size={17} color={tab === t.id ? colors.primary : colors.textSecondary} />
            <Text style={[S.tabTxt, { color: tab === t.id ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── BLOGS TAB ── */}
      {tab === 'blogs' && (
        loadingContent
          ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          : myBlogs.length === 0
            ? <View style={S.empty}>
                <Text style={{ fontSize: 44 }}>📝</Text>
                <Text style={[S.emptyTxt, { color: colors.textSecondary }]}>No blogs yet</Text>
                <TouchableOpacity
                  style={[S.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => navigation.navigate('WritePost')}
                >
                  <Text style={S.emptyBtnTxt}>Write First Blog</Text>
                </TouchableOpacity>
              </View>
            : myBlogs.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
                  onDelete={id => setMyBlogs(p => p.filter(x => x.id !== id))}
                />
              ))
      )}

      {/* ── REELS TAB ── */}
      {tab === 'reels' && (
        loadingContent
          ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          : myReels.length === 0
            ? <View style={S.empty}>
                <Text style={{ fontSize: 44 }}>🎬</Text>
                <Text style={[S.emptyTxt, { color: colors.textSecondary }]}>No reels yet</Text>
                <TouchableOpacity
                  style={[S.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => navigation.navigate('Reels')}
                >
                  <Text style={S.emptyBtnTxt}>Create First Reel</Text>
                </TouchableOpacity>
              </View>
            : <FlatList
                data={myReels}
                keyExtractor={i => i.id}
                numColumns={3}
                scrollEnabled={false}
                columnWrapperStyle={{ gap: 1.5 }}
                contentContainerStyle={{ gap: 1.5, paddingTop: 2 }}
                renderItem={renderReelItem}
              />
      )}

      {/* ── SAVED TAB ── */}
      {tab === 'saved' && (
        loadingContent
          ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          : savedPosts.length === 0
            ? <View style={S.empty}>
                <Text style={{ fontSize: 44 }}>🔖</Text>
                <Text style={[S.emptyTxt, { color: colors.textSecondary }]}>No saved posts</Text>
              </View>
            : savedPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
                />
              ))
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === 'settings' && (
        <View style={S.settingsSection}>
          <Text style={[S.settingsGroupLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
          <View style={[S.settingsCard, { backgroundColor: colors.card }]}>
            <View style={[S.settingRow, { borderBottomColor: colors.border }]}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#6366F120' }]}>
                  <Ionicons name="person-outline" size={18} color="#6366F1" />
                </View>
                <View>
                  <Text style={[S.settingTitle, { color: colors.text }]}>{profile?.name}</Text>
                  <Text style={[S.settingSubtitle, { color: colors.textSecondary }]}>{user?.email}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={[S.settingRow, { borderBottomColor: colors.border }]}
              onPress={() => { setEditing(true); setTab('blogs'); }}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#10B98120' }]}>
                  <Ionicons name="create-outline" size={18} color="#10B981" />
                </View>
                <Text style={[S.settingTitle, { color: colors.text }]}>Edit Profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[S.settingRow, { borderBottomColor: colors.border }]} onPress={pickBanner}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="image-outline" size={18} color="#F59E0B" />
                </View>
                <Text style={[S.settingTitle, { color: colors.text }]}>Change Banner</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={[S.settingRow, { borderBottomColor: colors.border }]} onPress={pickPhoto}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#EC489920' }]}>
                  <Ionicons name="camera-outline" size={18} color="#EC4899" />
                </View>
                <Text style={[S.settingTitle, { color: colors.text }]}>Change Photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity style={[S.settingRow, { borderBottomColor: colors.border }]}
                onPress={() => navigation.navigate('Admin')}>
                <View style={S.settingLeft}>
                  <View style={[S.settingIcon, { backgroundColor: '#6366F120' }]}>
                    <Ionicons name="shield-checkmark-outline" size={18} color="#6366F1" />
                  </View>
                  <Text style={[S.settingTitle, { color: colors.text }]}>Admin Panel</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[S.settingsGroupLabel, { color: colors.textSecondary }]}>PRIVACY</Text>
          <View style={[S.settingsCard, { backgroundColor: colors.card }]}>
            {[
              { key: 'privateAccount', icon: 'lock-closed-outline', color: '#EF4444', title: 'Private Account', subtitle: 'Sirf followers content dekh sakte hain' },
              { key: 'hideEmail',      icon: 'mail-outline',         color: '#F59E0B', title: 'Hide Email',       subtitle: 'Email profile pe nahi dikhegi' },
              { key: 'hidePhone',      icon: 'call-outline',         color: '#10B981', title: 'Hide Phone',       subtitle: 'Phone number hide rahega' },
              { key: 'hideFollowers',  icon: 'people-outline',       color: '#6366F1', title: 'Hide Followers',   subtitle: 'Followers count nahi dikhega' },
            ].map((s, i, arr) => (
              <View key={s.key}
                style={[S.settingRow, i < arr.length - 1 && { borderBottomWidth: 0.5 }, { borderBottomColor: colors.border }]}>
                <View style={S.settingLeft}>
                  <View style={[S.settingIcon, { backgroundColor: s.color + '20' }]}>
                    <Ionicons name={s.icon} size={18} color={s.color} />
                  </View>
                  <View>
                    <Text style={[S.settingTitle, { color: colors.text }]}>{s.title}</Text>
                    <Text style={[S.settingSubtitle, { color: colors.textSecondary }]}>{s.subtitle}</Text>
                  </View>
                </View>
                <Switch
                  value={form[s.key]}
                  onValueChange={v => {
                    setForm(p => ({ ...p, [s.key]: v }));
                    updateDoc(doc(db, 'users', user.uid), { [`privacy.${s.key}`]: v }).catch(() => {});
                  }}
                  trackColor={{ false: colors.border, true: s.color + '80' }}
                  thumbColor={form[s.key] ? s.color : '#FFF'}
                />
              </View>
            ))}
          </View>

          <Text style={[S.settingsGroupLabel, { color: colors.textSecondary }]}>PREFERENCES</Text>
          <View style={[S.settingsCard, { backgroundColor: colors.card }]}>
            <View style={[S.settingRow, { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#8B5CF620' }]}>
                  <Ionicons name={isDark ? 'moon' : 'sunny'} size={18} color="#8B5CF6" />
                </View>
                <Text style={[S.settingTitle, { color: colors.text }]}>Dark Mode</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: '#8B5CF680' }}
                thumbColor={isDark ? '#8B5CF6' : '#FFF'}
              />
            </View>

            <TouchableOpacity style={[S.settingRow, { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
              onPress={() => navigation.navigate('Notifications')}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="notifications-outline" size={18} color="#F59E0B" />
                </View>
                <Text style={[S.settingTitle, { color: colors.text }]}>Notifications</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity style={S.settingRow} onPress={() => navigation.navigate('AIAssistant')}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#10B98120' }]}>
                  <Ionicons name="sparkles-outline" size={18} color="#10B981" />
                </View>
                <View>
                  <Text style={[S.settingTitle, { color: colors.text }]}>AI Assistant</Text>
                  <Text style={[S.settingSubtitle, { color: colors.textSecondary }]}>Campus Ink AI se baat karo</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[S.settingsGroupLabel, { color: colors.textSecondary }]}>DANGER ZONE</Text>
          <View style={[S.settingsCard, { backgroundColor: colors.card }]}>
            <TouchableOpacity style={[S.settingRow, { borderBottomWidth: 0 }]} onPress={handleLogout}>
              <View style={S.settingLeft}>
                <View style={[S.settingIcon, { backgroundColor: '#EF444420' }]}>
                  <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                </View>
                <Text style={[S.settingTitle, { color: '#EF4444' }]}>Logout</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>

          <Text style={[S.version, { color: colors.textSecondary }]}>Campus Ink v1.0.0 · Made with ❤️</Text>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  bannerContainer: { position: 'relative', height: 150 },
  banner: { width: '100%', height: 150 },
  bannerEditHint: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 150, alignItems: 'center', justifyContent: 'center' },
  bannerTopRow: { position: 'absolute', top: 50, right: 16, flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  profileTop: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  avatarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  avatarWrapper: { position: 'relative', marginTop: -44 },
  avatar: { width: 82, height: 82, borderRadius: 41, borderWidth: 3, borderColor: '#fff' },
  cameraBtn: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#000000AA', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  quickBtns: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  quickBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  quickBtnTxt: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  name: { fontSize: 21, fontWeight: '800', marginBottom: 2 },
  handle: { fontSize: 13, marginBottom: 2 },
  dept: { fontSize: 13, marginBottom: 6 },
  badgePill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  badgeTxt: { fontWeight: '700', fontSize: 12 },
  bio: { fontSize: 14, lineHeight: 21, marginBottom: 8 },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, borderRadius: 16, paddingVertical: 14, elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  editCard: { margin: 16, borderRadius: 18, padding: 18 },
  editTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 8, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, gap: 10 },
  inputField: { flex: 1, fontSize: 14 },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  saveBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  tabs: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 1 },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5 },
  tabTxt: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 50, gap: 10 },
  emptyTxt: { fontSize: 15 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  emptyBtnTxt: { color: '#FFF', fontWeight: '700' },
  // Reel grid
  reelThumb: { width: REEL_SIZE, height: REEL_SIZE * 1.4, position: 'relative' },
  reelThumbImg: { width: '100%', height: '100%' },
  reelPlayIcon: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 3 },
  reelLikes: { position: 'absolute', bottom: 4, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  // Settings
  settingsSection: { padding: 16 },
  settingsGroupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  settingsCard: { borderRadius: 16, marginBottom: 6, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 15, fontWeight: '500' },
  settingSubtitle: { fontSize: 12, marginTop: 1 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 16, marginBottom: 8 },
});