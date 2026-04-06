// src/screens/Search/SearchScreen.js
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, getDocs, limit,
  startAfter, where,
} from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import moment from 'moment';

const PAGE_SIZE = 15;

export default function SearchScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();

  // ── FIX: Use ref for input to prevent re-render causing keyboard dismiss ──
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);

  const [results, setResults] = useState({ posts: [], users: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [searched, setSearched] = useState(false);

  // Pagination for posts
  const [lastPostDoc, setLastPostDoc] = useState(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  const TRENDING = ['Technology', 'Campus Life', 'Events', 'Sports', 'Study Tips', 'Career'];

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (reset = true) => {
    if (!searchQuery.trim()) return;
    if (reset) {
      setLoading(true);
      setSearched(true);
      setLastPostDoc(null);
      setHasMorePosts(true);
    } else {
      if (!hasMorePosts || loadingMorePosts) return;
      setLoadingMorePosts(true);
    }

    try {
      const q = searchQuery.toLowerCase();

      // ── Posts with pagination ─────────────────────────────────────────────
      let postConstraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
      if (!reset && lastPostDoc) postConstraints.push(startAfter(lastPostDoc));

      const postsSnap = await getDocs(
        query(collection(db, 'posts'), ...postConstraints)
      );
      const allPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filteredPosts = allPosts.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.content?.toLowerCase().includes(q) ||
        p.authorName?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );

      setLastPostDoc(postsSnap.docs[postsSnap.docs.length - 1] || null);
      setHasMorePosts(postsSnap.docs.length === PAGE_SIZE);

      // ── Users (only on first search) ──────────────────────────────────────
      let filteredUsers = results.users;
      if (reset) {
        const usersSnap = await getDocs(
          query(collection(db, 'users'), limit(50))
        );
        filteredUsers = usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u =>
            u.name?.toLowerCase().includes(q) ||
            u.department?.toLowerCase().includes(q) ||
            u.college?.toLowerCase().includes(q) ||
            u.username?.toLowerCase().includes(q)
          );
      }

      if (reset) {
        setResults({ posts: filteredPosts, users: filteredUsers });
      } else {
        setResults(prev => ({
          ...prev,
          posts: [...prev.posts, ...filteredPosts],
        }));
      }
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
      setLoadingMorePosts(false);
    }
  }, [searchQuery, lastPostDoc, hasMorePosts, loadingMorePosts, results.users]);

  const goToUserProfile = useCallback((userId) => {
    if (!userId) return;
    if (userId === user?.uid) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('UserProfile', { userId });
    }
  }, [user?.uid, navigation]);

  // ── Render post result ────────────────────────────────────────────────────
  const renderPost = useCallback(({ item }) => (
    <TouchableOpacity
      style={[styles.postResult, { backgroundColor: colors.card }]}
      onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
      activeOpacity={0.8}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.postThumb} />
      ) : (
        <View style={[styles.postThumb, {
          backgroundColor: colors.primary + '20',
          alignItems: 'center', justifyContent: 'center',
        }]}>
          <Text>📝</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.postTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        {/* Author — tappable */}
        <TouchableOpacity onPress={() => goToUserProfile(item.authorId)}>
          <Text style={[styles.postMeta, { color: colors.primary }]}>
            {item.authorName} · {moment(item.createdAt?.toDate()).fromNow()}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.postStats, { color: colors.textSecondary }]}>
          ❤️ {item.likesCount || 0}  💬 {item.commentsCount || 0}
        </Text>
      </View>
    </TouchableOpacity>
  ), [colors, navigation, goToUserProfile]);

  // ── Render user result ────────────────────────────────────────────────────
  const renderUser = useCallback(({ item }) => (
    <TouchableOpacity
      style={[styles.userResult, { backgroundColor: colors.card }]}
      onPress={() => goToUserProfile(item.id)}
      activeOpacity={0.8}
    >
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={styles.userAvatar} />
      ) : (
        <View style={[styles.userAvatarFallback, { backgroundColor: colors.primary + '30' }]}>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 18 }}>
            {item.name?.[0]?.toUpperCase() || '?'}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.userName, { color: colors.text }]}>
          {item.name} {item.isVerified ? '✓' : ''}
        </Text>
        <Text style={[styles.userDept, { color: colors.textSecondary }]}>
          {[item.department, item.college].filter(Boolean).join(' · ') || 'Campus Ink Member'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
          ⭐ {item.points || 0} pts · {item.followersCount || 0} followers
        </Text>
      </View>
      {/* Follow button */}
      <TouchableOpacity
        style={[styles.followBtn, { backgroundColor: colors.primary }]}
        onPress={() => goToUserProfile(item.id)}
      >
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>View</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  ), [colors, goToUserProfile]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* FIX: TextInput with ref — no re-render causing blur ──────────── */}
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search posts, people..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => handleSearch(true)}
            returnKeyType="search"
            autoFocus
            // FIX: prevents keyboard from closing
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setSearched(false);
              setResults({ posts: [], users: [] });
            }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: colors.primary }]}
          onPress={() => handleSearch(true)}
        >
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {!searched ? (
        // ── Trending ─────────────────────────────────────────────────────────
        <View style={styles.trendingSection}>
          <Text style={[styles.trendingTitle, { color: colors.text }]}>🔥 Trending Topics</Text>
          <View style={styles.trendingGrid}>
            {TRENDING.map((topic, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.trendingChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  setSearchQuery(topic);
                  setTimeout(() => handleSearch(true), 100);
                }}
              >
                <Text style={[styles.trendingText, { color: colors.text }]}>#{topic}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <>
          {/* ── Tabs ── */}
          <View style={[styles.tabs, { backgroundColor: colors.card }]}>
            {['posts', 'users'].map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, activeTab === t && { backgroundColor: colors.primary }]}
                onPress={() => setActiveTab(t)}
              >
                <Text style={[styles.tabText, { color: activeTab === t ? '#FFF' : colors.textSecondary }]}>
                  {t === 'posts'
                    ? `📝 Posts (${results.posts.length})`
                    : `👥 People (${results.users.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={activeTab === 'posts' ? results.posts : results.users}
              keyExtractor={i => i.id}
              renderItem={activeTab === 'posts' ? renderPost : renderUser}
              // FIX: keyboard stays open
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              ListFooterComponent={
                activeTab === 'posts' && loadingMorePosts
                  ? <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
                  : null
              }
              onEndReached={() => {
                if (activeTab === 'posts') handleSearch(false);
              }}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={{ fontSize: 40 }}>🔍</Text>
                  <Text style={[{ color: colors.textSecondary, marginTop: 8 }]}>
                    No {activeTab} found for "{searchQuery}"
                  </Text>
                </View>
              }
              contentContainerStyle={{ padding: 14, gap: 10 }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, gap: 10,
  },
  backBtn: { padding: 4 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  searchBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  searchBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  trendingSection: { padding: 20 },
  trendingTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  trendingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  trendingChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  trendingText: { fontSize: 13, fontWeight: '500' },
  tabs: { flexDirection: 'row', margin: 14, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  postResult: { flexDirection: 'row', gap: 12, borderRadius: 14, padding: 12 },
  postThumb: { width: 60, height: 60, borderRadius: 10 },
  postTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  postMeta: { fontSize: 12, marginBottom: 3 },
  postStats: { fontSize: 11 },
  userResult: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, borderRadius: 14, padding: 14,
  },
  userAvatar: { width: 50, height: 50, borderRadius: 25 },
  userAvatarFallback: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
  },
  userName: { fontSize: 15, fontWeight: '700' },
  userDept: { fontSize: 12, marginTop: 2, marginBottom: 2 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  empty: { alignItems: 'center', paddingTop: 60 },
});