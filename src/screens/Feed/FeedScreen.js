// src/screens/Feed/FeedScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, StatusBar,
  Image, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, limit, startAfter,
  getDocs, where, onSnapshot, doc, updateDoc, increment,
} from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { CATEGORIES } from '../../constants';
import PostCard from '../../components/post/PostCard';

const PAGE_SIZE = 10;

// ── AdBanner ──────────────────────────────────────────────────────────────────
function AdBanner({ colors }) {
  const [ad, setAd] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { loadAd(); }, []);

  const loadAd = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'ads'), where('status', '==', 'active'), limit(5)
      ));
      if (!snap.empty) {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const picked = list[Math.floor(Math.random() * list.length)];
        setAd(picked);
        updateDoc(doc(db, 'ads', picked.id), { impressions: increment(1) }).catch(() => {});
      }
    } catch (e) {}
  };

  const handlePress = () => {
    if (!ad) return;
    updateDoc(doc(db, 'ads', ad.id), { clicks: increment(1) }).catch(() => {});
    if (ad.link) Linking.openURL(ad.link).catch(() => {});
  };

  if (!ad || dismissed) return null;

  return (
    <View style={[adStyles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={adStyles.topRow}>
        <View style={[adStyles.badge, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="megaphone-outline" size={10} color={colors.textSecondary} />
          <Text style={[adStyles.badgeText, { color: colors.textSecondary }]}>Sponsored</Text>
        </View>
        <TouchableOpacity onPress={() => setDismissed(true)}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {ad.mediaUrl
        ? <TouchableOpacity onPress={handlePress}>
            <Image source={{ uri: ad.mediaUrl }} style={adStyles.img} resizeMode="cover" />
          </TouchableOpacity>
        : null}
      <View style={adStyles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[adStyles.title, { color: colors.text }]} numberOfLines={1}>{ad.title}</Text>
          {ad.body ? <Text style={[adStyles.body, { color: colors.textSecondary }]} numberOfLines={2}>{ad.body}</Text> : null}
        </View>
        {ad.cta
          ? <TouchableOpacity style={[adStyles.cta, { backgroundColor: colors.primary }]} onPress={handlePress}>
              <Text style={adStyles.ctaText}>{ad.cta}</Text>
            </TouchableOpacity>
          : null}
      </View>
    </View>
  );
}

const adStyles = StyleSheet.create({
  wrap: { marginHorizontal: 14, marginVertical: 6, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  img: { width: '100%', height: 150 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  title: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 17 },
  cta: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
});

// ── Main FeedScreen ───────────────────────────────────────────────────────────
export default function FeedScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);

  // ── FIX: search state moved OUTSIDE renderHeader to prevent re-render ─────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => { fetchPosts(true); }, [selectedCategory]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, 'notifications'),
        where('userId', '==', user.uid),
        where('read', '==', false)),
      snap => setUnreadCount(snap.docs.length)
    );
    return unsub;
  }, [user]);

  // ── Blogs infinite scroll ─────────────────────────────────────────────────
  const fetchPosts = async (reset = false) => {
    if (!reset && (!hasMore || loadingMore)) return;
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      let constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
      if (selectedCategory !== 'all') {
        constraints = [where('category', '==', selectedCategory), ...constraints];
      }
      if (!reset && lastDoc) constraints.push(startAfter(lastDoc));
      const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
      const newPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      reset ? setPosts(newPosts) : setPosts(prev => [...prev, ...newPosts]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setLastDoc(null);
    setHasMore(true);
    fetchPosts(true);
  };

  const handleEndReached = useCallback(() => {
    // Only paginate when not searching
    if (!searchQuery) fetchPosts(false);
  }, [searchQuery, hasMore, loadingMore, lastDoc]);

  const filteredPosts = searchQuery
    ? posts.filter(p =>
        p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.authorName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : posts;

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // ── FIX: renderHeader extracted as stable component outside FlatList ──────
  // This prevents keyboard from dismissing on every keystroke
  const renderHeader = useCallback(() => (
    <View>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>
            {getGreeting()} 👋
          </Text>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Campus Ink</Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
            onPress={() => {
              setSearchVisible(v => {
                if (v) setSearchQuery('');
                return !v;
              });
            }}
          >
            <Ionicons
              name={searchVisible ? 'close' : 'search'}
              size={20}
              color={colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
            onPress={() => navigation.navigate('Leaderboard')}
          >
            <Ionicons name="trophy-outline" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.notifBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.notifText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Category chips */}
      <FlatList
        data={CATEGORIES}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.catChip, {
              backgroundColor: selectedCategory === item.id ? item.color : colors.card,
              borderColor: selectedCategory === item.id ? item.color : colors.border,
            }]}
            onPress={() => {
              setSelectedCategory(item.id);
              setLastDoc(null);
              setHasMore(true);
            }}
          >
            <Text style={styles.catEmoji}>{item.icon}</Text>
            <Text style={[styles.catLabel, {
              color: selectedCategory === item.id ? '#FFF' : colors.textSecondary,
            }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        keyExtractor={i => i.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catList}
      />
    </View>
  ), [colors, searchVisible, unreadCount, selectedCategory, navigation]);

  // ── Render post item ──────────────────────────────────────────────────────
  const renderItem = useCallback(({ item, index }) => (
    <>
      <PostCard
        post={item}
        navigation={navigation}
        onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
        onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))}
      />
      {(index + 1) % 5 === 0 && <AdBanner colors={colors} />}
    </>
  ), [navigation, colors]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading posts...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── FIX: Search bar OUTSIDE FlatList — prevents keyboard dismiss ── */}
      {searchVisible && (
        <View style={[styles.searchBarFixed, {
          backgroundColor: colors.inputBg,
          borderColor: colors.border,
        }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search posts, topics, authors..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            // FIX: these prevent keyboard from closing
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <FlatList
        data={filteredPosts}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
            : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No posts yet</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Be the first to write something!
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('WritePost')}
            >
              <Text style={styles.emptyBtnText}>✍️ Write First Post</Text>
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        // FIX: keyboard stays open while scrolling
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate('WritePost')}
        activeOpacity={0.85}
      >
        <Ionicons name="create" size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 58, paddingBottom: 14,
  },
  greeting: { fontSize: 13, marginBottom: 2 },
  pageTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  topActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18,
    height: 18, borderRadius: 9, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 3,
  },
  notifText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  // FIX: search bar is fixed above FlatList, not inside it
  searchBarFixed: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 18, marginBottom: 4, marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, borderWidth: 1, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  catList: { paddingHorizontal: 18, paddingBottom: 14, gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, gap: 6,
  },
  catEmoji: { fontSize: 14 },
  catLabel: { fontSize: 13, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 10 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center' },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  fab: {
    position: 'absolute', bottom: 88, right: 18,
    width: 56, height: 56, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8,
  },
});