// src/screens/Profile/ProfileReelsScreen.js
// Shows ONLY the reels of a specific user — completely isolated from global feed
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, ActivityIndicator, Alert, Image, Share,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  Pressable, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect } from '@react-navigation/native';
import { db } from '../../services/firebase';
import {
  collection, query, where, orderBy, getDocs,
  doc, setDoc, deleteDoc, updateDoc, increment,
  addDoc, serverTimestamp, onSnapshot, limit, getDoc,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

const { width: W, height: H } = Dimensions.get('window');

const GRADIENTS = [
  ['#6366F1', '#8B5CF6'], ['#EC4899', '#EF4444'],
  ['#10B981', '#059669'], ['#F59E0B', '#EF4444'],
  ['#3B82F6', '#6366F1'], ['#8B5CF6', '#EC4899'],
];

// ── Single Reel Item (self-contained) ────────────────────────────────────────
const ProfileReelItem = React.memo(function ProfileReelItem({
  reel,
  isActive,
  isScreenFocused,
  user,
  profile,
  navigation,
}) {
  const tapCount  = useRef(0);
  const tapTimer  = useRef(null);
  const heartTimer = useRef(null);

  const [isLiked,       setIsLiked]      = useState(false);
  const [likesCount,    setLikesCount]   = useState(reel.likesCount || 0);
  const [showHeart,     setShowHeart]    = useState(false);
  const [isVideoPaused, setIsVideoPaused]= useState(false);
  const [isMuted,       setIsMuted]      = useState(false);
  const [showComments,  setShowComments] = useState(false);
  const [comments,      setComments]     = useState([]);
  const [commentText,   setCommentText]  = useState('');
  const [downloading,   setDownloading]  = useState(false);

  const isOwn = reel.authorId === user?.uid;
  const shouldPlay = isActive && isScreenFocused && !isVideoPaused;

  // Load like status
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'reels', reel.id, 'likes', user.uid))
      .then(s => setIsLiked(s.exists()))
      .catch(() => {});
  }, [reel.id, user?.uid]);

  // Reset pause when reel leaves view
  useEffect(() => {
    if (!isActive) setIsVideoPaused(false);
  }, [isActive]);

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

  const handleMediaPress = useCallback(() => {
    tapCount.current += 1;
    if (tapCount.current === 1) {
      tapTimer.current = setTimeout(() => {
        tapCount.current = 0;
        if (reel.type === 'video') setIsVideoPaused(p => !p);
      }, 250);
    } else if (tapCount.current >= 2) {
      clearTimeout(tapTimer.current);
      tapCount.current = 0;
      if (!isLiked) handleLike();
      else triggerHeart();
    }
  }, [isLiked, handleLike, triggerHeart, reel.type]);

  const handleDownload = useCallback(async () => {
    if (!reel.mediaUrl) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required'); return; }
      setDownloading(true);
      const ext  = reel.type === 'video' ? 'mp4' : 'jpg';
      const path = `${FileSystem.cacheDirectory}campusink_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(reel.mediaUrl, path);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Downloaded! ✅', 'Gallery mein save ho gaya.');
    } catch {
      Alert.alert('Error', 'Download fail ho gaya.');
    } finally {
      setDownloading(false);
    }
  }, [reel.mediaUrl, reel.type]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `CampusInk pe ye reel dekho! 🎬\n${reel.caption || ''}\ncampusink://reel/${reel.id}`,
      });
    } catch (_) {}
  }, [reel]);

  const openComments = () => {
    setShowComments(true);
    onSnapshot(
      query(collection(db, 'reels', reel.id, 'comments'),
        orderBy('createdAt', 'desc'), limit(50)),
      snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  };

  const postComment = async () => {
    if (!commentText.trim() || !user) return;
    const t = commentText.trim();
    setCommentText('');
    await addDoc(collection(db, 'reels', reel.id, 'comments'), {
      authorId:    user.uid,
      authorName:  profile?.name || 'User',
      authorPhoto: profile?.photoURL || '',
      text: t,
      createdAt: serverTimestamp(),
    }).catch(() => {});
    updateDoc(doc(db, 'reels', reel.id), { commentsCount: increment(1) }).catch(() => {});
  };

  return (
    <View style={S.reel}>
      {/* Media */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleMediaPress}>
        {reel.type === 'video' && reel.mediaUrl ? (
          <Video
            source={{ uri: reel.mediaUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted={isMuted}
            useNativeControls={false}
            shouldPlay={shouldPlay}
          />
        ) : reel.type === 'photo' && reel.mediaUrl ? (
          <Image
            source={{ uri: reel.mediaUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={GRADIENTS[reel.gradientIndex || 0]}
            style={StyleSheet.absoluteFill}
          >
            <View style={S.quoteWrap}>
              <Text style={S.quoteMark}>❝</Text>
              <Text style={S.quoteBody}>{reel.quoteText || ''}</Text>
              {reel.quoteAuthor
                ? <Text style={S.quoteBy}>— {reel.quoteAuthor}</Text>
                : null}
            </View>
          </LinearGradient>
        )}
      </Pressable>

      {/* Gradient overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.82)']}
        style={S.overlay}
        pointerEvents="none"
      />

      {/* Pause indicator */}
      {isVideoPaused && isActive && reel.type === 'video' && (
        <View style={S.pauseWrap} pointerEvents="none">
          <View style={S.pauseCircle}>
            <Ionicons name="pause" size={26} color="#FFF" />
          </View>
        </View>
      )}

      {/* Heart animation */}
      {showHeart && (
        <View style={S.heartAnim} pointerEvents="none">
          <Ionicons name="heart" size={88} color="#F87171" />
        </View>
      )}

      {/* Mute button */}
      {reel.type === 'video' && isActive && (
        <TouchableOpacity
          style={S.muteBtn}
          onPress={() => setIsMuted(m => !m)}
        >
          <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Bottom info */}
      <View style={S.bottomInfo} pointerEvents="box-none">
        <View style={S.authorRow}>
          <View style={S.ava}>
            {reel.authorPhoto
              ? <Image source={{ uri: reel.authorPhoto }} style={{ width: '100%', height: '100%' }} />
              : <Text style={S.avaLetter}>{(reel.authorName || 'U')[0].toUpperCase()}</Text>
            }
          </View>
          <Text style={S.authorName}>
            @{(reel.authorName || 'user').replace(/\s+/g, '').toLowerCase()}
          </Text>
        </View>
        {reel.caption
          ? <Text style={S.caption} numberOfLines={2}>{reel.caption}</Text>
          : null}
        {reel.tags?.length > 0 && (
          <View style={S.tagsRow}>
            {reel.tags.map(tag => (
              <Text key={tag} style={S.tag}>#{tag}</Text>
            ))}
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={S.actions} pointerEvents="box-none">
        {/* Like */}
        <TouchableOpacity style={S.actionBtn} onPress={handleLike} activeOpacity={0.7}>
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={32}
            color={isLiked ? '#F87171' : '#fff'}
          />
          <Text style={S.actionTxt}>
            {likesCount > 999 ? `${(likesCount / 1000).toFixed(1)}k` : likesCount}
          </Text>
        </TouchableOpacity>

        {/* Comments */}
        <TouchableOpacity style={S.actionBtn} onPress={openComments} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={29} color="#fff" />
          <Text style={S.actionTxt}>{reel.commentsCount || 0}</Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity style={S.actionBtn} onPress={handleShare} activeOpacity={0.7}>
          <Ionicons name="paper-plane-outline" size={29} color="#fff" />
          <Text style={S.actionTxt}>Share</Text>
        </TouchableOpacity>

        {/* Download */}
        {(reel.type === 'video' || reel.type === 'photo') && reel.mediaUrl && (
          <TouchableOpacity
            style={S.actionBtn}
            onPress={handleDownload}
            disabled={downloading}
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowComments(false)}
          />
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
                  <View style={S.commentAva}>
                    {c.authorPhoto
                      ? <Image source={{ uri: c.authorPhoto }} style={{ width: '100%', height: '100%', borderRadius: 17 }} />
                      : <Text style={S.commentAvaLetter}>{(c.authorName || 'U')[0].toUpperCase()}</Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.commentAuthor}>{c.authorName}</Text>
                    <Text style={S.commentTxt}>{c.text}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={S.noComments}>Pehla comment karo! 👇</Text>
              }
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
                <Ionicons
                  name="send"
                  size={22}
                  color={commentText.trim() ? '#6366F1' : 'rgba(255,255,255,0.3)'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
});

// ── Main ProfileReelsScreen ───────────────────────────────────────────────────
export default function ProfileReelsScreen({ navigation, route }) {
  const { user, profile } = useAuth();

  // ── Receive reels list + startIndex from Profile ──────────────────────────
  const { reels: initialReels, startIndex = 0, userId } = route.params || {};

  const [reels, setReels]               = useState(initialReels || []);
  const [loading, setLoading]           = useState(!initialReels?.length);
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isScreenFocused, setIsScreenFocused] = useState(false);

  const flatRef = useRef();
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  // Focus/blur control
  useFocusEffect(useCallback(() => {
    setIsScreenFocused(true);
    return () => setIsScreenFocused(false);
  }, []));

  // If no reels passed, fetch fresh (fallback)
  useEffect(() => {
    if (initialReels?.length) {
      // Scroll to correct index after mount
      setTimeout(() => {
        if (startIndex > 0 && flatRef.current) {
          flatRef.current.scrollToIndex({ index: startIndex, animated: false });
        }
      }, 100);
      return;
    }
    // Fallback: fetch if not passed
    if (!userId) return;
    setLoading(true);
    const fetchReels = async () => {
      try {
        const q = query(
          collection(db, 'reels'),
          where('authorId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        setReels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // fallback without orderBy
        try {
          const q2 = query(collection(db, 'reels'), where('authorId', '==', userId));
          const snap2 = await getDocs(q2);
          setReels(
            snap2.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
          );
        } catch (e2) { console.error(e2); }
      } finally {
        setLoading(false);
      }
    };
    fetchReels();
  }, [userId, initialReels]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const renderItem = useCallback(({ item, index }) => (
    <ProfileReelItem
      reel={item}
      isActive={index === currentIndex}
      isScreenFocused={isScreenFocused}
      user={user}
      profile={profile}
      navigation={navigation}
    />
  ), [currentIndex, isScreenFocused, user, profile, navigation]);

  if (loading) {
    return (
      <View style={S.loader}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Loading Reels...</Text>
      </View>
    );
  }

  if (!reels.length) {
    return (
      <View style={S.loader}>
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={{ fontSize: 44 }}>🎬</Text>
        <Text style={{ color: '#fff', fontSize: 16, marginTop: 12 }}>No reels yet</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <StatusBar hidden />

      {/* Back button */}
      <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>

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
        initialScrollIndex={startIndex}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const S = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  loader:           { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  backBtn:          { position: 'absolute', top: 52, left: 16, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  reel:             { width: W, height: H, backgroundColor: '#111' },
  overlay:          { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.52 },
  pauseWrap:        { position: 'absolute', alignSelf: 'center', top: '44%', zIndex: 5 },
  pauseCircle:      { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  heartAnim:        { position: 'absolute', alignSelf: 'center', top: '36%', zIndex: 99 },
  muteBtn:          { position: 'absolute', top: 70, right: 16, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.45)', padding: 8, borderRadius: 20 },
  bottomInfo:       { position: 'absolute', bottom: 115, left: 16, right: 90, zIndex: 5 },
  authorRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ava:              { width: 38, height: 38, borderRadius: 19, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#fff' },
  avaLetter:        { color: '#fff', fontWeight: '800', fontSize: 15 },
  authorName:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  caption:          { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  tagsRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag:              { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  actions:          { position: 'absolute', right: 14, bottom: 115, alignItems: 'center', gap: 22, zIndex: 10 },
  actionBtn:        { alignItems: 'center', gap: 4 },
  actionTxt:        { color: '#fff', fontSize: 12, fontWeight: '600' },
  quoteWrap:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  quoteMark:        { fontSize: 52, color: 'rgba(255,255,255,0.25)', alignSelf: 'flex-start' },
  quoteBody:        { fontSize: 22, color: '#fff', fontWeight: '700', textAlign: 'center', lineHeight: 33, marginBottom: 16 },
  quoteBy:          { fontSize: 14, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' },
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
});