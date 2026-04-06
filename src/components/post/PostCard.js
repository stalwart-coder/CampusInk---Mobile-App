// src/components/post/PostCard.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Share, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  doc, updateDoc, arrayUnion, arrayRemove, increment,
  addDoc, collection, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CATEGORIES, REPORT_REASONS } from '../../constants';
import { createNotification } from '../../services/notifications';
import moment from 'moment';

export default function PostCard({ post, onPress, onDelete, navigation }) {
  const { colors } = useTheme();
  const { user, profile, isAdmin } = useAuth();
  const safeLikes = Array.isArray(post.likes) ? post.likes : [];
  const [liked, setLiked] = useState(safeLikes.includes(user?.uid));
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [saved, setSaved] = useState(
    Array.isArray(profile?.savedPosts) && profile.savedPosts.includes(post.id)
  );
  const [showOptions, setShowOptions] = useState(false);

  const category = CATEGORIES.find(c => c.id === post.category);
  const isOwner = user?.uid === post.authorId;

  // ── Navigate to author profile ─────────────────────────────────────────────
  const goToAuthorProfile = useCallback((e) => {
    e.stopPropagation();
    if (!post.authorId) return;
    if (post.authorId === user?.uid) {
      // Own profile — navigate to Profile tab
      navigation?.navigate?.('Profile');
    } else {
      navigation?.navigate?.('UserProfile', { userId: post.authorId });
    }
  }, [post.authorId, user?.uid, navigation]);

  const handleLike = async () => {
    if (!user) return;
    const ref = doc(db, 'posts', post.id);
    if (liked) {
      await updateDoc(ref, { likes: arrayRemove(user.uid), likesCount: increment(-1) });
      setLiked(false);
      setLikesCount(p => Math.max(0, p - 1));
    } else {
      await updateDoc(ref, { likes: arrayUnion(user.uid), likesCount: increment(1) });
      setLiked(true);
      setLikesCount(p => p + 1);
      if (post.authorId !== user.uid) {
        await createNotification({
          userId: post.authorId,
          type: 'like',
          title: '❤️ New Like',
          body: `${profile?.name || 'Someone'} liked your post "${post.title}"`,
          postId: post.id,
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
      await updateDoc(ref, { savedPosts: arrayRemove(post.id) });
      setSaved(false);
    } else {
      await updateDoc(ref, { savedPosts: arrayUnion(post.id) });
      setSaved(true);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out "${post.title}" on Campus Ink!\n\n${post.content?.substring(0, 100)}...`,
        title: post.title,
      });
    } catch (e) {}
  };

  const handleDelete = () => {
    Alert.alert('Delete Post', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteDoc(doc(db, 'posts', post.id));
          onDelete?.(post.id);
        }
      },
    ]);
  };

  const handleReport = () => {
    Alert.alert('Report Post', 'Why are you reporting this post?',
      REPORT_REASONS.map(reason => ({
        text: reason,
        onPress: async () => {
          await addDoc(collection(db, 'reports'), {
            postId: post.id,
            postTitle: post.title,
            reportedBy: user.uid,
            reason,
            createdAt: serverTimestamp(),
          });
          Alert.alert('Reported', 'Thank you for keeping Campus Ink safe!');
        },
      }))
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.95}
    >
      {/* Category Badge */}
      {category && (
        <View style={[styles.catBadge, { backgroundColor: category.color + '20' }]}>
          <Text style={styles.catEmoji}>{category.icon}</Text>
          <Text style={[styles.catLabel, { color: category.color }]}>{category.label}</Text>
        </View>
      )}

      {/* Post Image */}
      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.image} />
      ) : null}

      {/* Title */}
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {post.title}
      </Text>

      {/* Content Preview */}
      <Text style={[styles.content, { color: colors.textSecondary }]} numberOfLines={3}>
        {post.content}
      </Text>

      {/* ── Author Row — tappable to go to profile ── */}
      <TouchableOpacity
        style={styles.authorRow}
        onPress={goToAuthorProfile}
        activeOpacity={0.7}
      >
        {post.authorPhoto ? (
          <Image source={{ uri: post.authorPhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.primary + '30' }]}>
            <Text style={[styles.avatarLetter, { color: colors.primary }]}>
              {post.authorName?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={styles.authorInfo}>
          <View style={styles.authorNameRow}>
            <Text style={[styles.authorName, { color: colors.text }]}>{post.authorName}</Text>
            {post.isVerified && <Text style={styles.verified}>✓</Text>}
          </View>
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>
            {moment(post.createdAt?.toDate()).fromNow()}
          </Text>
        </View>

        {/* Options Menu */}
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }}
          style={styles.optionBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Options Dropdown */}
      {showOptions && (
        <View style={[styles.optionsMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.optionItem} onPress={() => { setShowOptions(false); handleShare(); }}>
            <Ionicons name="share-outline" size={16} color={colors.text} />
            <Text style={[styles.optionText, { color: colors.text }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionItem} onPress={() => { setShowOptions(false); handleSave(); }}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={16} color={colors.text} />
            <Text style={[styles.optionText, { color: colors.text }]}>{saved ? 'Unsave' : 'Save'}</Text>
          </TouchableOpacity>
          {(isOwner || isAdmin) && (
            <TouchableOpacity style={styles.optionItem} onPress={() => { setShowOptions(false); handleDelete(); }}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={[styles.optionText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          )}
          {!isOwner && (
            <TouchableOpacity style={styles.optionItem} onPress={() => { setShowOptions(false); handleReport(); }}>
              <Ionicons name="flag-outline" size={16} color={colors.error} />
              <Text style={[styles.optionText, { color: colors.error }]}>Report</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Action Bar */}
      <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={19}
            color={liked ? '#FF4757' : colors.textSecondary}
          />
          <Text style={[styles.actionCount, { color: colors.textSecondary }]}>{likesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
          <Text style={[styles.actionCount, { color: colors.textSecondary }]}>
            {post.commentsCount || 0}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleSave}>
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={saved ? colors.primary : colors.textSecondary}
          />
        </TouchableOpacity>

        <View style={styles.viewsContainer}>
          <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.viewsText, { color: colors.textSecondary }]}>
            {post.views || 0}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14, marginBottom: 14, borderRadius: 18,
    padding: 16, elevation: 2, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 8,
  },
  catBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    marginBottom: 10, gap: 4,
  },
  catEmoji: { fontSize: 12 },
  catLabel: { fontSize: 11, fontWeight: '700' },
  image: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 6, lineHeight: 24 },
  content: { fontSize: 14, lineHeight: 21, marginBottom: 14 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarLetter: { fontWeight: '700', fontSize: 15 },
  authorInfo: { flex: 1 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorName: { fontSize: 13, fontWeight: '600' },
  verified: { fontSize: 12, color: '#6C63FF' },
  timeText: { fontSize: 11, marginTop: 1 },
  optionBtn: { padding: 6 },
  optionsMenu: {
    position: 'absolute', right: 16, top: 50, borderRadius: 12,
    borderWidth: 1, padding: 6, zIndex: 999, minWidth: 140,
    elevation: 10, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  optionItem: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8,
  },
  optionText: { fontSize: 14 },
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12, marginTop: 8, borderTopWidth: 1, gap: 16,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { fontSize: 13 },
  viewsContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  viewsText: { fontSize: 12 },
});