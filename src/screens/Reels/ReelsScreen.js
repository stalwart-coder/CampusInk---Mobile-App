// src/screens/Reels/ReelsScreen.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, ActivityIndicator, Alert, TextInput, Modal,
  Image, ScrollView, KeyboardAvoidingView, Platform, Share,
  StatusBar, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, getDocs, addDoc,
  serverTimestamp, doc, setDoc, deleteDoc, getDoc,
  increment, updateDoc, limit, startAfter, where,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../services/cloudinary';

const { width: W, height: H } = Dimensions.get('window');
const REEL_TYPES = { VIDEO: 'video', PHOTO: 'photo', TEXT: 'text' };
const PAGE_SIZE  = 10;

const GRADIENTS = [
  ['#6366F1', '#8B5CF6'], ['#EC4899', '#EF4444'],
  ['#10B981', '#059669'], ['#F59E0B', '#EF4444'],
  ['#3B82F6', '#6366F1'], ['#8B5CF6', '#EC4899'],
];

// ── Smart feed algorithm ──────────────────────────────────────────────────────
const smartMix = (reels, likedIds = new Set()) => {
  if (!reels.length) return [];
  const now = Date.now();
  const scored = reels.map(r => {
    const age = (now - (r.createdAt?.toDate?.()?.getTime?.() || now)) / 3600000;
    const isLiked = likedIds.has(r.id) ? 10 : 0;
    const score =
      (r.likesCount || 0) * 2 +
      (r.commentsCount || 0) * 1.5 -
      age * 0.3 +
      isLiked +
      Math.random() * 20;
    return { ...r, _score: score };
  });
  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ _score, ...r }) => r);
};

// ─────────────────────────────────────────────────────────────────────────────
// ReelItem
// ─────────────────────────────────────────────────────────────────────────────
const ReelItem = React.memo(function ReelItem({
  reel, isActive, isScreenFocused, user, profile, navigation,
  onTagPress, onLockScroll, onUnlockScroll,
}) {
  const tapCount   = useRef(0);
  const tapTimer   = useRef(null);
  const heartTimer = useRef(null);

  const [isLiked,      setIsLiked]      = useState(false);
  const [likesCount,   setLikesCount]   = useState(reel.likesCount || 0);
  const [showHeart,    setShowHeart]    = useState(false);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isVideoPaused,setIsVideoPaused]= useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments,     setComments]     = useState([]);
  const [commentText,  setCommentText]  = useState('');
  const [isFollowing,  setIsFollowing]  = useState(false);
  const [downloading,  setDownloading]  = useState(false);

  const isOwn    = reel.authorId === user?.uid;
  const shouldPlay = isActive && isScreenFocused && !isVideoPaused;

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'reels', reel.id, 'likes', user.uid))
      .then(s => setIsLiked(s.exists())).catch(() => {});
    if (!isOwn) {
      getDoc(doc(db, 'users', user.uid))
        .then(s => setIsFollowing((s.data()?.following || []).includes(reel.authorId)))
        .catch(() => {});
    }
  }, [reel.id, user?.uid]);

  useEffect(() => { if (!isActive) setIsVideoPaused(false); }, [isActive]);

  const triggerHeart = useCallback(() => {
    setShowHeart(true);
    if (heartTimer.current) clearTimeout(heartTimer.current);
    heartTimer.current = setTimeout(() => setShowHeart(false), 900);
  }, []);

  const handleLike = useCallback(() => {
    if (!user) return;
    const likeRef = doc(db, 'reels', reel.id, 'likes', user.uid);
    if (isLiked) {
      setIsLiked(false);
      setLikesCount(p => Math.max(0, p - 1));
      deleteDoc(likeRef).catch(() => {});
      updateDoc(doc(db, 'reels', reel.id), { likesCount: increment(-1) }).catch(() => {});
    } else {
      setIsLiked(true);
      setLikesCount(p => p + 1);
      triggerHeart();
      setDoc(likeRef, { userId: user.uid, createdAt: serverTimestamp() }).catch(() => {});
      updateDoc(doc(db, 'reels', reel.id), { likesCount: increment(1) }).catch(() => {});
    }
  }, [isLiked, user, reel.id, triggerHeart]);

  // ── FIX: onPressIn locks scroll BEFORE FlatList pan responder ────────────
  const handleLikePressIn  = useCallback(() => onLockScroll(),   [onLockScroll]);
  const handleLikePressOut = useCallback(() => onUnlockScroll(), [onUnlockScroll]);
  const handleLikePress    = useCallback(() => handleLike(),     [handleLike]);

  // ── Media tap: single = pause, double = like (NO scroll, NO pause toggle) ─
  const handleMediaPress = useCallback(() => {
    tapCount.current += 1;
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
        if (reel.type === REEL_TYPES.VIDEO) setIsVideoPaused(p => !p);
      }, 250);
    } else if (tapCount.current >= 2) {
      clearTimeout(tapTimer.current);
      tapCount.current = 0;
      // double tap — like only, NO scroll, NO pause
      onLockScroll();
      setTimeout(onUnlockScroll, 350);
      if (!isLiked) handleLike();
      else triggerHeart();
    }
  }, [isLiked, handleLike, triggerHeart, reel.type, onLockScroll, onUnlockScroll]);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!reel.mediaUrl) {
      Alert.alert('Download nahi ho sakta', 'Is reel mein koi media nahi hai.');
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Gallery access de do Settings mein.');
        return;
      }
      setDownloading(true);
      const ext  = reel.type === REEL_TYPES.VIDEO ? 'mp4' : 'jpg';
      const path = `${FileSystem.cacheDirectory}campusink_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(reel.mediaUrl, path);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Downloaded! ✅', 'Gallery mein save ho gaya.');
    } catch {
      Alert.alert('Error', 'Download fail ho gaya. Try again.');
    } finally { setDownloading(false); }
  }, [reel.mediaUrl, reel.type]);

  const handleShare = useCallback(async () => {
    try {
      const tagStr = (reel.tags || []).map(t => '#' + t).join(' ');
      await Share.share({
        message: `CampusInk pe ye reel dekho! 🎬\n${reel.caption || ''}\n${tagStr}\ncampusink://reel/${reel.id}`,
      });
    } catch (_) {}
  }, [reel]);

  const handleFollow = async () => {
    if (!user || isOwn) return;
    try {
      const [mS, tS] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'users', reel.authorId)),
      ]);
      const mF = mS.data()?.following || [];
      const tF = tS.data()?.followers || [];
      if (isFollowing) {
        setIsFollowing(false);
        await updateDoc(doc(db, 'users', user.uid),
          { following: mF.filter(i => i !== reel.authorId), followingCount: increment(-1) });
        await updateDoc(doc(db, 'users', reel.authorId),
          { followers: tF.filter(i => i !== user.uid), followersCount: increment(-1) });
      } else {
        setIsFollowing(true);
        await updateDoc(doc(db, 'users', user.uid),
          { following: [...mF, reel.authorId], followingCount: increment(1) });
        await updateDoc(doc(db, 'users', reel.authorId),
          { followers: [...tF, user.uid], followersCount: increment(1) });
      }
    } catch { setIsFollowing(p => !p); }
  };

  const openComments = () => {
    setShowComments(true);
    const unsub = require('firebase/firestore').onSnapshot(
      query(collection(db, 'reels', reel.id, 'comments'),
        orderBy('createdAt', 'desc'), limit(50)),
      snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  };

  const postComment = async () => {
    if (!commentText.trim() || !user) return;
    const t = commentText.trim();
    setCommentText('');
    await addDoc(collection(db, 'reels', reel.id, 'comments'), {
      authorId: user.uid, authorName: profile?.name || 'User',
      authorPhoto: profile?.photoURL || '', text: t,
      createdAt: serverTimestamp(),
    }).catch(() => {});
    updateDoc(doc(db, 'reels', reel.id), { commentsCount: increment(1) }).catch(() => {});
  };

  const deleteComment = (commentId) => {
    Alert.alert('Delete Comment', 'Ye comment delete karo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'reels', reel.id, 'comments', commentId)).catch(() => {});
        await updateDoc(doc(db, 'reels', reel.id), { commentsCount: increment(-1) }).catch(() => {});
        setComments(p => p.filter(c => c.id !== commentId));
      }},
    ]);
  };

  return (
    <View style={S.reel}>
      {/* ── Media ── */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleMediaPress}>
        {reel.type === REEL_TYPES.VIDEO && reel.mediaUrl ? (
          <Video
            source={{ uri: reel.mediaUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            isLooping isMuted={isMuted}
            useNativeControls={false}
            shouldPlay={shouldPlay}
          />
        ) : reel.type === REEL_TYPES.PHOTO && reel.mediaUrl ? (
          <Image source={{ uri: reel.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={GRADIENTS[reel.gradientIndex || 0]} style={StyleSheet.absoluteFill}>
            <View style={S.quoteWrap}>
              <Text style={S.quoteMark}>❝</Text>
              <Text style={S.quoteBody}>{reel.quoteText || ''}</Text>
              {reel.quoteAuthor ? <Text style={S.quoteBy}>— {reel.quoteAuthor}</Text> : null}
            </View>
          </LinearGradient>
        )}
      </Pressable>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={S.overlay} pointerEvents="none" />

      {isVideoPaused && isActive && reel.type === REEL_TYPES.VIDEO && (
        <View style={S.pauseWrap} pointerEvents="none">
          <View style={S.pauseCircle}><Ionicons name="pause" size={26} color="#FFF" /></View>
        </View>
      )}

      {showHeart && (
        <View style={S.heartAnim} pointerEvents="none">
          <Ionicons name="heart" size={88} color="#F87171" />
        </View>
      )}

      {reel.type === REEL_TYPES.VIDEO && isActive && (
        <TouchableOpacity style={S.muteBtn} onPress={() => setIsMuted(m => !m)}>
          <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Bottom info ── */}
      <View style={S.bottomInfo} pointerEvents="box-none">
        <TouchableOpacity
          style={S.authorRow}
          onPress={() => !isOwn && navigation.navigate('UserProfile', { userId: reel.authorId })}
          activeOpacity={0.8}
        >
          <View style={S.ava}>
            {reel.authorPhoto
              ? <Image source={{ uri: reel.authorPhoto }} style={{ width: '100%', height: '100%' }} />
              : <Text style={S.avaLetter}>{(reel.authorName || 'U')[0].toUpperCase()}</Text>}
          </View>
          <Text style={S.authorName}>
            @{(reel.authorName || 'user').replace(/\s+/g, '').toLowerCase()}
          </Text>
          {!isOwn && (
            <TouchableOpacity
              style={[S.followBtn, isFollowing && S.followingBtn]}
              onPress={() => handleFollow()}
            >
              <Text style={[S.followTxt, isFollowing && { color: 'rgba(255,255,255,0.7)' }]}>
                {isFollowing ? '✓ Following' : '+ Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {reel.caption ? <Text style={S.caption} numberOfLines={2}>{reel.caption}</Text> : null}
        {reel.tags?.length > 0 && (
          <View style={S.tagsRow}>
            {reel.tags.map(tag => (
              <TouchableOpacity key={tag} onPress={() => onTagPress?.(tag)}>
                <Text style={S.tag}>#{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {reel.type === REEL_TYPES.VIDEO && (
          <Text style={S.hint}></Text>
        )}
      </View>

      {/* ── Action buttons ── */}
      <View style={S.actions} pointerEvents="box-none">
        {/* ── FIX: Like — onPressIn locks scroll BEFORE FlatList sees gesture ── */}
        <TouchableOpacity
          style={S.actionBtn}
          onPressIn={handleLikePressIn}
          onPressOut={handleLikePressOut}
          onPress={handleLikePress}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={32}
            color={isLiked ? '#F87171' : '#fff'}
          />
          <Text style={S.actionTxt}>
            {likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={S.actionBtn}
          onPress={openComments}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={29} color="#fff" />
          <Text style={S.actionTxt}>{reel.commentsCount || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={S.actionBtn}
          onPress={handleShare}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.7}
        >
          <Ionicons name="paper-plane-outline" size={29} color="#fff" />
          <Text style={S.actionTxt}>Share</Text>
        </TouchableOpacity>

        {(reel.type === REEL_TYPES.VIDEO || reel.type === REEL_TYPES.PHOTO) && reel.mediaUrl && (
          <TouchableOpacity
            style={S.actionBtn}
            onPress={handleDownload}
            disabled={downloading}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.7}
          >
            {downloading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="download-outline" size={29} color="#fff" />
            }
            <Text style={S.actionTxt}>{downloading ? '...' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Comments Modal */}
      <Modal visible={showComments} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowComments(false)} />
          <View style={S.sheet}>
            <View style={S.sheetHandle} />
            <Text style={S.sheetTitle}>Comments ({reel.commentsCount || 0})</Text>
            <FlatList
              data={comments}
              keyExtractor={c => c.id}
              style={{ maxHeight: H * 0.42 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: c }) => (
                <View style={S.commentRow}>
                  <TouchableOpacity onPress={() => {
                    setShowComments(false);
                    setTimeout(() => {
                      if (c.authorId !== user?.uid)
                        navigation.navigate('UserProfile', { userId: c.authorId });
                    }, 300);
                  }}>
                    <View style={S.commentAva}>
                      {c.authorPhoto
                        ? <Image source={{ uri: c.authorPhoto }} style={{ width: '100%', height: '100%', borderRadius: 17 }} />
                        : <Text style={S.commentAvaLetter}>{(c.authorName || 'U')[0].toUpperCase()}</Text>}
                    </View>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={S.commentAuthor}>{c.authorName}</Text>
                    <Text style={S.commentTxt}>{c.text}</Text>
                  </View>
                  {c.authorId === user?.uid && (
                    <TouchableOpacity onPress={() => deleteComment(c.id)} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={15} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              ListEmptyComponent={<Text style={S.noComments}>Pehla comment karo! 👇</Text>}
            />
            <View style={S.commentInputRow}>
              <TextInput
                style={S.commentInput}
                placeholder="Comment likho..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={postComment}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={postComment} disabled={!commentText.trim()}>
                <Ionicons name="send" size={22} color={commentText.trim() ? '#6366F1' : 'rgba(255,255,255,0.3)'} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
});

// ── Search Grid ───────────────────────────────────────────────────────────────
const SearchGridItem = ({ reel, onPress }) => {
  const size = (W - 3) / 3;
  return (
    <TouchableOpacity
      style={{ width: size, height: size * 1.4, margin: 0.5 }}
      onPress={() => onPress(reel)}
      activeOpacity={0.85}
    >
      {reel.mediaUrl
        ? <Image source={{ uri: reel.thumbnailUrl || reel.mediaUrl }}
            style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <LinearGradient colors={GRADIENTS[reel.gradientIndex || 0]}
            style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
            <Text style={{ color: '#fff', fontSize: 11, textAlign: 'center', fontWeight: '600' }} numberOfLines={3}>
              {reel.quoteText}
            </Text>
          </LinearGradient>
      }
      {reel.type === REEL_TYPES.VIDEO && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 3 }}>
          <Ionicons name="play" size={10} color="#fff" />
        </View>
      )}
      <View style={{ position: 'absolute', bottom: 4, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Ionicons name="heart" size={11} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
          {reel.likesCount > 999 ? `${(reel.likesCount / 1000).toFixed(1)}k` : reel.likesCount || 0}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main ReelsScreen
// ─────────────────────────────────────────────────────────────────────────────
export default function ReelsScreen({ navigation, route }) {
  const { user, profile } = useAuth();

  const [reels,           setReels]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [loadingMore,     setLoadingMore]     = useState(false);
  const [hasMore,         setHasMore]         = useState(true);
  const [lastDoc,         setLastDoc]         = useState(null);
  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [scrollLocked,    setScrollLocked]    = useState(false);
  const [likedIds,        setLikedIds]        = useState(new Set());

  const [searchQuery,    setSearchQuery]    = useState('');
  const [showSearch,     setShowSearch]     = useState(false);
  const [activeFilter,   setActiveFilter]   = useState('all');
  const [filterTag,      setFilterTag]      = useState('');
  const [searchSelected, setSearchSelected] = useState(null);
  const [searchResults,  setSearchResults]  = useState([]);

  const [uploadModal,    setUploadModal]    = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reelType,       setReelType]       = useState(REEL_TYPES.TEXT);
  const [caption,        setCaption]        = useState('');
  const [quoteText,      setQuoteText]      = useState('');
  const [quoteName,      setQuoteName]      = useState('');
  const [selGradient,    setSelGradient]    = useState(0);
  const [media,          setMedia]          = useState(null);
  const [mediaType,      setMediaType]      = useState(null);
  const [tags,           setTags]           = useState([]);
  const [tagInput,       setTagInput]       = useState('');

  const flatRef = useRef();
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  // ── Scroll lock handlers ──────────────────────────────────────────────────
  const handleLockScroll   = useCallback(() => setScrollLocked(true),  []);
  const handleUnlockScroll = useCallback(() => setScrollLocked(false), []);

  useFocusEffect(useCallback(() => {
    setIsScreenFocused(true);
    if (route.params?.filterTag) {
      setFilterTag(route.params.filterTag);
      setActiveFilter('tag');
    }
    return () => {
      setIsScreenFocused(false);
      setScrollLocked(false);
    };
  }, [route.params?.filterTag]));

  // ── Load liked reel IDs for smart feed ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const loadLikes = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'reels'), limit(50))
        );
        const ids = new Set();
        await Promise.all(snap.docs.map(async d => {
          const likeSnap = await getDoc(doc(db, 'reels', d.id, 'likes', user.uid));
          if (likeSnap.exists()) ids.add(d.id);
        }));
        setLikedIds(ids);
      } catch (_) {}
    };
    loadLikes();
  }, [user?.uid]);

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchReels(true);
  }, [activeFilter, filterTag]);

  const fetchReels = async (reset = false) => {
    if (!reset && (!hasMore || loadingMore)) return;
    reset ? setLoading(true) : setLoadingMore(true);
    try {
      let constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];

      if (activeFilter === 'college' && profile?.college) {
        constraints = [
          where('authorCollege', '==', profile.college),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE),
        ];
      } else if (activeFilter === 'tag' && filterTag) {
        constraints = [
          where('tags', 'array-contains', filterTag.toLowerCase()),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE),
        ];
      }

      if (!reset && lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(collection(db, 'reels'), ...constraints));
      const newReels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mixed = smartMix(newReels, likedIds);

      if (reset) {
        setReels(mixed);
        setCurrentIndex(0);
      } else {
        setReels(prev => [...prev, ...mixed]);
      }
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error('fetchReels:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(reels); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(reels.filter(r =>
      r.caption?.toLowerCase().includes(q) ||
      r.quoteText?.toLowerCase().includes(q) ||
      r.tags?.some(t => t.includes(q)) ||
      r.authorName?.toLowerCase().includes(q)
    ));
  }, [searchQuery, reels]);

  const handleTagPress = useCallback((tag) => {
    setFilterTag(tag);
    setActiveFilter('tag');
    setShowSearch(false);
    setSearchQuery('');
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const idx = viewableItems[0].index ?? 0;
      setCurrentIndex(idx);
      // Load more when near end
      if (idx >= reels.length - 3) fetchReels(false);
    }
  }, [reels.length, hasMore, loadingMore]);

  const pickMedia = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      videoMaxDuration: 60,
    });
    if (!r.canceled && r.assets[0]) {
      setMedia(r.assets[0]);
      setMediaType(type);
      setReelType(type === 'video' ? REEL_TYPES.VIDEO : REEL_TYPES.PHOTO);
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!t || tags.includes(t) || tags.length >= 8) return;
    setTags(p => [...p, t]);
    setTagInput('');
  };

  const uploadReel = async () => {
    if (!user) return;
    if (reelType === REEL_TYPES.TEXT && !quoteText.trim()) {
      Alert.alert('', 'Quote text dalo.'); return;
    }
    if ((reelType === REEL_TYPES.VIDEO || reelType === REEL_TYPES.PHOTO) && !media) {
      Alert.alert('', 'Media select karo.'); return;
    }
    setUploading(true); setUploadProgress(10);
    try {
      let mediaUrl = null, thumbnailUrl = null;
      if (media) {
        setUploadProgress(30);
        const up = await uploadToCloudinary(media.uri, mediaType === 'video' ? 'video' : 'image');
        mediaUrl = up.url; thumbnailUrl = up.thumbnailUrl;
        setUploadProgress(80);
      }
      await addDoc(collection(db, 'reels'), {
        type: reelType,
        caption: caption.trim(),
        authorId:      user.uid,
        authorName:    profile?.name || profile?.displayName || 'User',
        authorPhoto:   profile?.photoURL || '',
        authorCollege: profile?.college || '',
        mediaUrl, thumbnailUrl,
        quoteText:    quoteText.trim(),
        quoteAuthor:  quoteName.trim(),
        gradientIndex: selGradient,
        tags,
        likesCount: 0, commentsCount: 0, viewsCount: 0,
        createdAt: serverTimestamp(),
      });
      setCaption(''); setQuoteText(''); setQuoteName(''); setTags([]);
      setMedia(null); setMediaType(null); setReelType(REEL_TYPES.TEXT);
      setUploadModal(false);
      Alert.alert('Posted! 🎉', 'Aapki reel live ho gayi.');
      fetchReels(true);
    } catch (e) {
      Alert.alert('Error', 'Upload fail: ' + e.message);
    } finally { setUploading(false); setUploadProgress(0); }
  };

  // ── Render item — stable callback ─────────────────────────────────────────
  const renderItem = useCallback(({ item, index }) => (
    <ReelItem
      reel={item}
      isActive={index === currentIndex}
      isScreenFocused={isScreenFocused}
      user={user}
      profile={profile}
      navigation={navigation}
      onTagPress={handleTagPress}
      onLockScroll={handleLockScroll}
      onUnlockScroll={handleUnlockScroll}
    />
  ), [currentIndex, isScreenFocused, user, profile, navigation,
      handleTagPress, handleLockScroll, handleUnlockScroll]);

  if (loading) return (
    <View style={S.loader}>
      <ActivityIndicator size="large" color="#6366F1" />
      <Text style={{ color: '#fff', marginTop: 12 }}>Loading Reels...</Text>
    </View>
  );

  // ── Search mode ───────────────────────────────────────────────────────────
  if (showSearch) {
    return (
      <View style={[S.container, { backgroundColor: '#000' }]}>
        <StatusBar barStyle="light-content" />
        <View style={S.searchHeader}>
          <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); }} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={S.searchInputWrap}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.5)" />
            <TextInput
              style={S.searchInputField}
              placeholder="Search reels, tags, people..."
              placeholderTextColor="rgba(255,255,255,0.4)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus autoCapitalize="none" returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {searchQuery.length > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }}>
            {searchResults.length} reels found
          </Text>
        )}
        <FlatList
          key="search-grid-3col"
          data={searchResults}
          keyExtractor={i => i.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 0 }}
          renderItem={({ item }) => (
            <SearchGridItem reel={item} onPress={setSearchSelected} />
          )}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 44 }}>🔍</Text>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 12 }}>
                {searchQuery ? 'No reels found' : 'Search reels'}
              </Text>
            </View>
          }
        />
        {searchSelected && (
          <Modal visible animationType="slide" onRequestClose={() => setSearchSelected(null)}>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
              <TouchableOpacity style={S.modalBack} onPress={() => setSearchSelected(null)}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <ReelItem
                reel={searchSelected}
                isActive isScreenFocused
                user={user} profile={profile} navigation={navigation}
                onTagPress={handleTagPress}
                onLockScroll={handleLockScroll}
                onUnlockScroll={handleUnlockScroll}
              />
            </View>
          </Modal>
        )}
      </View>
    );
  }

  // ── Main feed ─────────────────────────────────────────────────────────────
  return (
    <View style={S.container}>
      <StatusBar hidden />

      <View style={S.topBar}>
        <Text style={S.topTitle}>Reels</Text>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setShowSearch(true)}>
            <Ionicons name="search" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setUploadModal(true)}>
            <Ionicons name="add-circle" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={S.filterRow}>
        <TouchableOpacity
          style={[S.chip, activeFilter === 'all' && S.chipOn]}
          onPress={() => { setActiveFilter('all'); setFilterTag(''); }}
        >
          <Text style={[S.chipTxt, activeFilter === 'all' && { color: '#fff' }]}>🌍 All</Text>
        </TouchableOpacity>
        {profile?.college && (
          <TouchableOpacity
            style={[S.chip, activeFilter === 'college' && S.chipOn]}
            onPress={() => { setActiveFilter('college'); setFilterTag(''); }}
          >
            <Text style={[S.chipTxt, activeFilter === 'college' && { color: '#fff' }]}>🏫 My College</Text>
          </TouchableOpacity>
        )}
        {activeFilter === 'tag' && filterTag && (
          <View style={[S.chip, S.chipOn, { flexDirection: 'row', gap: 5 }]}>
            <Text style={[S.chipTxt, { color: '#fff' }]}>#{filterTag}</Text>
            <TouchableOpacity onPress={() => { setActiveFilter('all'); setFilterTag(''); }}>
              <Ionicons name="close" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {reels.length === 0 ? (
        <View style={S.empty}>
          <Text style={{ fontSize: 56 }}>🎬</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 14 }}>Koi reel nahi</Text>
          <TouchableOpacity style={[S.createBtn, { marginTop: 14 }]} onPress={() => setUploadModal(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Create Reel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={reels}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={H}
          snapToAlignment="start"
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, i) => ({ length: H, offset: H * i, index: i })}
          removeClippedSubviews
          maxToRenderPerBatch={2}
          windowSize={3}
          initialNumToRender={1}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!scrollLocked}
          disableIntervalMomentum
          ListFooterComponent={
            loadingMore
              ? <View style={{ height: H, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                  <ActivityIndicator size="large" color="#6366F1" />
                  <Text style={{ color: '#fff', marginTop: 12 }}>Loading more...</Text>
                </View>
              : null
          }
        />
      )}

      {/* Upload Modal */}
      <Modal visible={uploadModal} animationType="slide">
        <View style={S.uploadBox}>
          <View style={S.uploadHead}>
            <TouchableOpacity onPress={() => { setUploadModal(false); setMedia(null); setTags([]); }}>
              <Ionicons name="close" size={26} color="#F9FAFB" />
            </TouchableOpacity>
            <Text style={S.uploadTitle}>New Reel</Text>
            <TouchableOpacity onPress={uploadReel} disabled={uploading}>
              {uploading ? <ActivityIndicator color="#6366F1" /> : <Text style={S.postBtn}>Post</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={S.label}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              {[[REEL_TYPES.TEXT, '💬', 'Quote'], [REEL_TYPES.PHOTO, '🖼️', 'Photo'], [REEL_TYPES.VIDEO, '🎬', 'Video']].map(([t, icon, lbl]) => (
                <TouchableOpacity key={t}
                  style={[S.typeBtn, reelType === t && S.typeBtnOn]}
                  onPress={() => {
                    setReelType(t);
                    if (t === REEL_TYPES.VIDEO) pickMedia('video');
                    else if (t === REEL_TYPES.PHOTO) pickMedia('image');
                  }}>
                  <Text style={{ fontSize: 22 }}>{icon}</Text>
                  <Text style={[{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }, reelType === t && { color: '#6366F1' }]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {reelType === REEL_TYPES.TEXT && (
              <>
                <Text style={S.label}>Quote Text *</Text>
                <TextInput style={S.inp} placeholder="Quote..." placeholderTextColor="rgba(255,255,255,0.3)"
                  value={quoteText} onChangeText={setQuoteText} multiline numberOfLines={3} maxLength={200} />
                <Text style={S.label}>Attribution</Text>
                <TextInput style={S.inp} placeholder="Author naam..." placeholderTextColor="rgba(255,255,255,0.3)"
                  value={quoteName} onChangeText={setQuoteName} maxLength={60} />
                <Text style={S.label}>Background</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {GRADIENTS.map((g, i) => (
                    <TouchableOpacity key={i}
                      style={{ marginRight: 10, borderRadius: 10, borderWidth: 2.5, borderColor: selGradient === i ? '#fff' : 'transparent' }}
                      onPress={() => setSelGradient(i)}>
                      <LinearGradient colors={g} style={{ width: 50, height: 50, borderRadius: 8 }} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {(reelType === REEL_TYPES.PHOTO || reelType === REEL_TYPES.VIDEO) && (
              media ? (
                <View style={{ position: 'relative', marginBottom: 14 }}>
                  {mediaType === 'image'
                    ? <Image source={{ uri: media.uri }} style={{ width: '100%', height: 220, borderRadius: 14 }} resizeMode="cover" />
                    : <View style={{ backgroundColor: '#111827', borderRadius: 14, height: 130, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="videocam" size={36} color="#6366F1" />
                        <Text style={{ color: '#9CA3AF', marginTop: 8 }}>Video selected ✓</Text>
                      </View>
                  }
                  <TouchableOpacity style={{ position: 'absolute', top: 10, right: 10 }} onPress={() => setMedia(null)}>
                    <Ionicons name="close-circle" size={26} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={S.pickBtn}
                  onPress={() => pickMedia(reelType === REEL_TYPES.VIDEO ? 'video' : 'image')}>
                  <Ionicons name={reelType === REEL_TYPES.VIDEO ? 'videocam' : 'image'} size={30} color="#6366F1" />
                  <Text style={{ color: '#6366F1', fontSize: 14, marginTop: 10 }}>
                    {reelType === REEL_TYPES.VIDEO ? 'Video Choose Karo (max 60s)' : 'Photo Choose Karo'}
                  </Text>
                </TouchableOpacity>
              )
            )}

            <Text style={S.label}>Caption</Text>
            <TextInput style={S.inp} placeholder="Kuch likho..." placeholderTextColor="rgba(255,255,255,0.3)"
              value={caption} onChangeText={setCaption} multiline maxLength={300} />

            <Text style={S.label}>🏷️ Tags (max 8)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput style={[S.inp, { flex: 1, marginBottom: 0 }]}
                placeholder="e.g. iitbombay..." placeholderTextColor="rgba(255,255,255,0.3)"
                value={tagInput} onChangeText={setTagInput}
                onSubmitEditing={addTag} returnKeyType="done" autoCapitalize="none" />
              <TouchableOpacity style={{ backgroundColor: '#6366F1', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 }} onPress={addTag}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
              </TouchableOpacity>
            </View>
            {tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {tags.map(tag => (
                  <TouchableOpacity key={tag}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(99,102,241,0.2)', borderWidth: 1, borderColor: '#6366F1' }}
                    onPress={() => setTags(p => p.filter(t => t !== tag))}>
                    <Text style={{ color: '#6366F1', fontSize: 13, fontWeight: '600' }}>#{tag}</Text>
                    <Ionicons name="close" size={12} color="#6366F1" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {uploading && (
              <View>
                <View style={{ height: 5, backgroundColor: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{ height: '100%', backgroundColor: '#6366F1', width: `${uploadProgress}%` }} />
                </View>
                <Text style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginTop: 6 }}>
                  Uploading... {uploadProgress}%
                </Text>
              </View>
            )}
            <View style={{ height: 60 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  loader:           { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  topBar:           { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 54, paddingHorizontal: 20, paddingBottom: 6 },
  topTitle:         { fontSize: 20, fontWeight: '800', color: '#fff' },
  filterRow:        { position: 'absolute', top: 98, left: 16, zIndex: 10, flexDirection: 'row', gap: 8 },
  chip:             { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipOn:           { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  chipTxt:          { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  reel:             { width: W, height: H, backgroundColor: '#111' },
  overlay:          { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.52 },
  pauseWrap:        { position: 'absolute', alignSelf: 'center', top: '44%', zIndex: 5 },
  pauseCircle:      { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  heartAnim:        { position: 'absolute', alignSelf: 'center', top: '36%', zIndex: 99 },
  muteBtn:          { position: 'absolute', top: 70, right: 16, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.45)', padding: 8, borderRadius: 20 },
  bottomInfo:       { position: 'absolute', bottom: 115, left: 16, right: 90, zIndex: 5 },
  authorRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  ava:              { width: 38, height: 38, borderRadius: 19, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  avaLetter:        { color: '#fff', fontWeight: '800', fontSize: 15 },
  authorName:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  followBtn:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: '#fff' },
  followingBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.4)' },
  followTxt:        { color: '#fff', fontSize: 12, fontWeight: '700' },
  caption:          { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  tagsRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tag:              { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  hint:             { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  actions:          { position: 'absolute', right: 14, bottom: 115, alignItems: 'center', gap: 22, zIndex: 10 },
  actionBtn:        { alignItems: 'center', gap: 4 },
  actionTxt:        { color: '#fff', fontSize: 12, fontWeight: '600' },
  quoteWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  quoteMark:        { fontSize: 52, color: 'rgba(255,255,255,0.25)', alignSelf: 'flex-start' },
  quoteBody:        { fontSize: 22, color: '#fff', fontWeight: '700', textAlign: 'center', lineHeight: 33, marginBottom: 16 },
  quoteBy:          { fontSize: 14, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' },
  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  createBtn:        { backgroundColor: '#6366F1', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center' },
  sheet:            { backgroundColor: '#1f2937', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 36, maxHeight: H * 0.75 },
  sheetHandle:      { width: 36, height: 4, backgroundColor: '#374151', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle:       { fontSize: 16, fontWeight: '700', color: '#F9FAFB', marginBottom: 14 },
  commentRow:       { flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start' },
  commentAva:       { width: 34, height: 34, borderRadius: 17, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentAvaLetter: { color: '#fff', fontSize: 13, fontWeight: '700' },
  commentAuthor:    { fontSize: 12, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 },
  commentTxt:       { fontSize: 14, color: '#F9FAFB', lineHeight: 20 },
  noComments:       { color: '#6B7280', textAlign: 'center', paddingVertical: 24 },
  commentInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#374151', paddingTop: 12 },
  commentInput:     { flex: 1, backgroundColor: '#374151', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, color: '#F9FAFB', fontSize: 14 },
  searchHeader:     { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 54 : 44, paddingHorizontal: 12, paddingBottom: 12, gap: 8, backgroundColor: '#111' },
  searchInputWrap:  { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  searchInputField: { flex: 1, color: '#fff', fontSize: 15 },
  modalBack:        { position: 'absolute', top: 50, left: 16, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  uploadBox:        { flex: 1, backgroundColor: '#0a0a0f' },
  uploadHead:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  uploadTitle:      { fontSize: 17, fontWeight: '700', color: '#F9FAFB' },
  postBtn:          { fontSize: 16, fontWeight: '700', color: '#6366F1' },
  label:            { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 8, marginTop: 4 },
  typeBtn:          { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#1f2937', backgroundColor: '#111827' },
  typeBtnOn:        { borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.12)' },
  inp:              { backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#F9FAFB', fontSize: 14, marginBottom: 14 },
  pickBtn:          { backgroundColor: '#111827', borderWidth: 1.5, borderColor: '#1f2937', borderStyle: 'dashed', borderRadius: 14, paddingVertical: 36, alignItems: 'center', marginBottom: 14 },
});