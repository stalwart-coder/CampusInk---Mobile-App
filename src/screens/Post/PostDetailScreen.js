// src/screens/Post/PostDetailScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Image, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  doc, getDoc, collection, addDoc, query, orderBy,
  onSnapshot, serverTimestamp, updateDoc, increment,
  deleteDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CATEGORIES, POINTS } from '../../constants';
import { createNotification } from '../../services/notifications';
import moment from 'moment';

export default function PostDetailScreen({ navigation, route }) {
  const { postId } = route.params;
  const { colors } = useTheme();
  const { user, profile, isAdmin } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const scrollRef = useRef();

  useEffect(() => {
    loadPost();
    const unsub = listenComments();
    return unsub;
  }, []);

  const loadPost = async () => {
    try {
      const snap = await getDoc(doc(db, 'posts', postId));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setPost(data);
        setLiked(Array.isArray(data.likes) && data.likes.includes(user?.uid));
        setLikesCount(data.likesCount || 0);
        setSaved(Array.isArray(profile?.savedPosts) && profile.savedPosts.includes(postId));
        updateDoc(doc(db, 'posts', postId), { views: increment(1) });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const listenComments = () => {
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  };

  // ── FIX: Navigate to author profile ──────────────────────────────────────
  const goToAuthorProfile = useCallback(() => {
    if (!post?.authorId) return;
    if (post.authorId === user?.uid) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('UserProfile', { userId: post.authorId });
    }
  }, [post?.authorId, user?.uid, navigation]);

  // ── Navigate to comment author profile ────────────────────────────────────
  const goToCommentAuthorProfile = useCallback((authorId) => {
    if (!authorId) return;
    if (authorId === user?.uid) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('UserProfile', { userId: authorId });
    }
  }, [user?.uid, navigation]);

  const handleLike = async () => {
    if (!user || !post) return;
    const ref = doc(db, 'posts', postId);
    if (liked) {
      await updateDoc(ref, { likes: arrayRemove(user.uid), likesCount: increment(-1) });
      setLiked(false);
      setLikesCount(p => Math.max(0, p - 1));
    } else {
      await updateDoc(ref, { likes: arrayUnion(user.uid), likesCount: increment(1) });
      setLiked(true);
      setLikesCount(p => p + 1);
      if (post.authorId !== user.uid) {
        createNotification({
          userId: post.authorId,
          type: 'like',
          title: '❤️ New Like',
          body: `${profile?.name} liked your post "${post.title}"`,
          postId,
          fromUserId: user.uid,
          fromUserName: profile?.name,
          fromUserPhoto: profile?.photoURL,
        });
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    if (saved) {
      await updateDoc(ref, { savedPosts: arrayRemove(postId) });
      setSaved(false);
    } else {
      await updateDoc(ref, { savedPosts: arrayUnion(postId) });
      setSaved(true);
    }
  };

  const submitComment = async () => {
    if (!comment.trim() || !user) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        text: comment.trim(),
        authorId: user.uid,
        authorName: profile?.name || user.displayName,
        authorPhoto: profile?.photoURL || '',
        likes: [],
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', postId), { commentsCount: increment(1) });
      await updateDoc(doc(db, 'users', user.uid), { points: increment(POINTS.COMMENT_CREATE) });
      if (post?.authorId !== user.uid) {
        createNotification({
          userId: post.authorId,
          type: 'comment',
          title: '💬 New Comment',
          body: `${profile?.name} commented: "${comment.trim().substring(0, 50)}"`,
          postId,
          fromUserId: user.uid,
          fromUserName: profile?.name,
          fromUserPhoto: profile?.photoURL,
        });
      }
      setComment('');
    } catch (e) {
      Alert.alert('Error', 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId) => {
    Alert.alert('Delete Comment', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
          await updateDoc(doc(db, 'posts', postId), { commentsCount: increment(-1) });
        }
      },
    ]);
  };

  const handleShare = async () => {
    if (!post) return;
    await Share.share({
      message: `"${post.title}" on Campus Ink\n\n${post.content?.substring(0, 100)}...`,
    });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Post not found</Text>
      </View>
    );
  }

  const category = CATEGORIES.find(c => c.id === post.category);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {post.title}
        </Text>
        <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        {/* Cover Image */}
        {post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} style={styles.coverImage} />
        ) : null}

        <View style={styles.body}>
          {/* Category */}
          {category && (
            <View style={[styles.catBadge, { backgroundColor: category.color + '20' }]}>
              <Text style={{ color: category.color, fontWeight: '700', fontSize: 12 }}>
                {category.icon} {category.label}
              </Text>
            </View>
          )}

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>

          {/* ── FIX: Author row — fully tappable to navigate to profile ── */}
          <TouchableOpacity
            style={styles.authorRow}
            onPress={goToAuthorProfile}
            activeOpacity={0.7}
          >
            {post.authorPhoto ? (
              <Image source={{ uri: post.authorPhoto }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.primary + '30' }]}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {post.authorName?.[0] || '?'}
                </Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.authorName, { color: colors.text }]}>
                  {post.authorName}
                  {post.isVerified ? ' ✓' : ''}
                </Text>
                {/* Profile arrow hint */}
                <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
              </View>
              <Text style={[styles.postMeta, { color: colors.textSecondary }]}>
                {moment(post.createdAt?.toDate()).format('MMM D, YYYY')} · {post.views || 0} views
              </Text>
            </View>
          </TouchableOpacity>

          {/* Content */}
          <Text style={[styles.content, { color: colors.text }]}>{post.content}</Text>

          {/* Stats Row */}
          <View style={[styles.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            <TouchableOpacity style={styles.statItem} onPress={handleLike}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={20}
                color={liked ? '#FF4757' : colors.textSecondary}
              />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{likesCount} likes</Text>
            </TouchableOpacity>
            <View style={styles.statItem}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>
                {comments.length} comments
              </Text>
            </View>
            <TouchableOpacity style={styles.statItem} onPress={handleSave}>
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={saved ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>
                {saved ? 'Saved' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Comments */}
          <Text style={[styles.commentsHeader, { color: colors.text }]}>
            💬 Comments ({comments.length})
          </Text>

          {comments.length === 0 ? (
            <View style={styles.noComments}>
              <Text style={[{ color: colors.textSecondary, textAlign: 'center' }]}>
                No comments yet. Be the first! 💬
              </Text>
            </View>
          ) : (
            comments.map(c => (
              <View key={c.id} style={[styles.commentCard, { backgroundColor: colors.card }]}>
                <View style={styles.commentHeader}>
                  {/* ── FIX: Comment author — tappable to navigate to profile ── */}
                  <TouchableOpacity onPress={() => goToCommentAuthorProfile(c.authorId)}>
                    {c.authorPhoto ? (
                      <Image source={{ uri: c.authorPhoto }} style={styles.commentAvatar} />
                    ) : (
                      <View style={[styles.commentAvatarFallback, { backgroundColor: colors.primary + '30' }]}>
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>
                          {c.authorName?.[0] || '?'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.commentAuthorInfo}>
                    <TouchableOpacity onPress={() => goToCommentAuthorProfile(c.authorId)}>
                      <Text style={[styles.commentAuthor, { color: colors.primary }]}>
                        {c.authorName}
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.commentTime, { color: colors.textSecondary }]}>
                      {moment(c.createdAt?.toDate()).fromNow()}
                    </Text>
                  </View>
                  {(c.authorId === user?.uid || isAdmin) && (
                    <TouchableOpacity onPress={() => deleteComment(c.id)}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[styles.commentText, { color: colors.text }]}>{c.text}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Comment Input */}
      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {profile?.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.inputAvatar} />
        ) : (
          <View style={[styles.inputAvatarFallback, { backgroundColor: colors.primary + '30' }]}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
              {profile?.name?.[0] || '?'}
            </Text>
          </View>
        )}
        <TextInput
          style={[styles.commentInput, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Write a comment..."
          placeholderTextColor={colors.textSecondary}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: comment.trim() ? colors.primary : colors.border }]}
          onPress={submitComment}
          disabled={!comment.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="send" size={16} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56,
    paddingBottom: 14, borderBottomWidth: 1, gap: 10,
  },
  headerBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  coverImage: { width: '100%', height: 240 },
  body: { padding: 18 },
  catBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 10, marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '800', lineHeight: 32, marginBottom: 16 },
  authorRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 20,
    padding: 10, borderRadius: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  authorInfo: {},
  authorName: { fontSize: 14, fontWeight: '700' },
  postMeta: { fontSize: 12, marginTop: 2 },
  content: { fontSize: 16, lineHeight: 27, marginBottom: 24 },
  statsRow: {
    flexDirection: 'row', gap: 20, paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 24,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 13 },
  commentsHeader: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  noComments: { paddingVertical: 24, alignItems: 'center' },
  commentCard: { borderRadius: 14, padding: 14, marginBottom: 10 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  commentAvatar: { width: 34, height: 34, borderRadius: 17 },
  commentAvatarFallback: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  commentAuthorInfo: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: '700' },
  commentTime: { fontSize: 11, marginTop: 1 },
  commentText: { fontSize: 14, lineHeight: 21 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, gap: 10, borderTopWidth: 1,
  },
  inputAvatar: { width: 34, height: 34, borderRadius: 17 },
  inputAvatarFallback: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  commentInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
});