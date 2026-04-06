// src/screens/Groups/GroupChatScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Image, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Modal, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, updateDoc, limit, getDoc, setDoc,
  arrayUnion, arrayRemove, increment, deleteDoc, getDocs,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { uploadImage, uploadToCloudinary } from '../../services/cloudinary';
import moment from 'moment';

const { width: W } = Dimensions.get('window');

const POST_TYPES = [
  { id: 'text',         icon: 'create-outline',      label: 'Text',      color: '#6366F1' },
  { id: 'photo',        icon: 'image-outline',        label: 'Photo',     color: '#10B981' },
  { id: 'video',        icon: 'videocam-outline',     label: 'Video',     color: '#F59E0B' },
  { id: 'question',     icon: 'help-circle-outline',  label: 'Question',  color: '#EC4899' },
  { id: 'announcement', icon: 'megaphone-outline',    label: 'Announce',  color: '#EF4444' },
];

export default function GroupChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();

  const groupId = route.params?.group?.id || route.params?.groupId;

  const [group, setGroup] = useState(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [memberRole, setMemberRole] = useState(null);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  const [activeTab, setActiveTab] = useState('posts');
  const [messages, setMessages] = useState([]);
  const [groupPosts, setGroupPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [postModal, setPostModal] = useState(false);
  const [postType, setPostType] = useState('text');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postTags, setPostTags] = useState([]);
  const [postTagInput, setPostTagInput] = useState('');
  const [postMedia, setPostMedia] = useState(null);
  const [postMediaType, setPostMediaType] = useState(null);
  const [posting, setPosting] = useState(false);

  const [expandedPost, setExpandedPost] = useState(null);
  const [postComments, setPostComments] = useState({});
  const [commentTexts, setCommentTexts] = useState({});
  const [submittingComment, setSubmittingComment] = useState(false);

  const flatRef = useRef();
  const isGroupAdmin = memberRole === 'owner' || memberRole === 'admin';

  // Load group
  useEffect(() => {
    if (!groupId) { navigation.goBack(); return; }
    const unsub = onSnapshot(doc(db, 'groups', groupId), snap => {
      if (!snap.exists()) { navigation.goBack(); return; }
      setGroup({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [groupId]);

  // Check membership via subcollection (matches GroupsScreen schema)
  useEffect(() => {
    if (!groupId || !user) return;
    const memberRef = doc(db, 'groups', groupId, 'members', user.uid);
    const unsub = onSnapshot(memberRef, snap => {
      if (snap.exists()) {
        setIsMember(true);
        setMemberRole(snap.data()?.role || 'member');
        setHasPendingRequest(false);
      } else {
        setIsMember(false);
        setMemberRole(null);
        checkPendingRequest();
      }
      setLoadingGroup(false);
    });
    return () => unsub();
  }, [groupId, user?.uid]);

  const checkPendingRequest = async () => {
    if (!groupId || !user) return;
    try {
      const snap = await getDocs(collection(db, 'groups', groupId, 'joinRequests'));
      const mine = snap.docs.find(d => d.data().userId === user.uid && d.data().status === 'pending');
      setHasPendingRequest(!!mine);
    } catch (_) {}
  };

  // Load messages
  useEffect(() => {
    if (!groupId || !isMember) return;
    const q = query(collection(db, 'groups', groupId, 'messages'), orderBy('createdAt', 'asc'), limit(200));
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 150);
    });
  }, [groupId, isMember]);

  // Load group posts (subcollection only — separate from blog/reels)
  useEffect(() => {
    if (!groupId || !isMember) return;
    setLoadingPosts(true);
    const q = query(collection(db, 'groups', groupId, 'posts'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, snap => {
      setGroupPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingPosts(false);
    });
  }, [groupId, isMember]);

  // Join group
  const handleJoin = async () => {
    if (!user || !group) return;
    setJoiningGroup(true);
    try {
      if (group.isPrivate) {
        await addDoc(collection(db, 'groups', groupId, 'joinRequests'), {
          userId: user.uid,
          userName: profile?.name || profile?.displayName || 'User',
          userPhoto: profile?.photoURL || '',
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        setHasPendingRequest(true);
        Alert.alert('Request Sent!', 'Group admin aapki request review karega.');
      } else {
        await setDoc(doc(db, 'groups', groupId, 'members', user.uid), {
          userId: user.uid, role: 'member', joinedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'groups', groupId), { membersCount: increment(1) });
      }
    } catch (e) {
      Alert.alert('Error', 'Join nahi ho saka: ' + e.message);
    } finally {
      setJoiningGroup(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    const t = msgText.trim();
    if (!t || !isMember) return;
    setMsgText('');
    setSending(true);
    try {
      await addDoc(collection(db, 'groups', groupId, 'messages'), {
        text: t, mediaUrl: '', type: 'text',
        senderId: user.uid,
        senderName: profile?.name || profile?.displayName || 'User',
        senderPhoto: profile?.photoURL || '',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'groups', groupId), { lastMessage: t, lastMessageAt: serverTimestamp() });
    } catch { Alert.alert('Error', 'Message send nahi hua.'); }
    finally { setSending(false); }
  };

  const sendImageChat = async () => {
    if (!isMember) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (r.canceled) return;
    setUploading(true);
    try {
      const url = await uploadImage(r.assets[0].uri);
      await addDoc(collection(db, 'groups', groupId, 'messages'), {
        text: '', mediaUrl: url, type: 'image',
        senderId: user.uid,
        senderName: profile?.name || profile?.displayName || 'User',
        senderPhoto: profile?.photoURL || '',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'groups', groupId), { lastMessage: '📷 Photo', lastMessageAt: serverTimestamp() });
    } catch { Alert.alert('Error', 'Image send nahi hua.'); }
    finally { setUploading(false); }
  };

  // Create group post
  const createPost = async () => {
    if (!isMember) { Alert.alert('', 'Group join karo pehle.'); return; }
    if (!postContent.trim() && !postMedia) { Alert.alert('', 'Kuch likho ya media add karo.'); return; }
    setPosting(true);
    try {
      let mediaUrl = '', mediaThumb = '';
      if (postMedia) {
        if (postMediaType === 'video') {
          const up = await uploadToCloudinary(postMedia.uri, 'video');
          mediaUrl = up.url; mediaThumb = up.thumbnailUrl || '';
        } else {
          mediaUrl = await uploadImage(postMedia.uri);
        }
      }
      await addDoc(collection(db, 'groups', groupId, 'posts'), {
        type: postType,
        title: postTitle.trim(),
        content: postContent.trim(),
        mediaUrl, mediaThumb,
        mediaType: postMediaType || null,
        tags: postTags,
        authorId: user.uid,
        authorName: profile?.name || profile?.displayName || 'User',
        authorPhoto: profile?.photoURL || '',
        authorDept: profile?.department || '',
        likes: [], likesCount: 0, commentsCount: 0,
        deleted: false, groupId,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'groups', groupId), {
        lastMessage: `📝 ${postTitle || postContent.slice(0, 30) || 'New Post'}`,
        lastMessageAt: serverTimestamp(),
      });
      setPostTitle(''); setPostContent(''); setPostTags([]);
      setPostTagInput(''); setPostMedia(null); setPostMediaType(null);
      setPostType('text'); setPostModal(false);
      Alert.alert('✅ Posted!', 'Post group mein live hai!');
    } catch (e) { Alert.alert('Error', 'Post nahi ho saka: ' + e.message); }
    finally { setPosting(false); }
  };

  const likePost = async (post) => {
    if (!user || !isMember) return;
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const liked = likes.includes(user.uid);
    await updateDoc(doc(db, 'groups', groupId, 'posts', post.id), {
      likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      likesCount: increment(liked ? -1 : 1),
    }).catch(() => {});
  };

  const loadComments = useCallback((postId) => {
    return onSnapshot(
      query(collection(db, 'groups', groupId, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(30)),
      snap => setPostComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))
    );
  }, [groupId]);

  const toggleExpand = (postId) => {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    if (!postComments[postId]) loadComments(postId);
  };

  const addComment = async (postId) => {
    const t = (commentTexts[postId] || '').trim();
    if (!t || !user || !isMember) return;
    setCommentTexts(p => ({ ...p, [postId]: '' }));
    setSubmittingComment(true);
    try {
      await addDoc(collection(db, 'groups', groupId, 'posts', postId, 'comments'), {
        text: t, authorId: user.uid,
        authorName: profile?.name || profile?.displayName || 'User',
        authorPhoto: profile?.photoURL || '',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'groups', groupId, 'posts', postId), { commentsCount: increment(1) });
    } catch {} finally { setSubmittingComment(false); }
  };

  const deletePost = (post) => {
    if (post.authorId !== user?.uid && !isGroupAdmin) return;
    Alert.alert('Delete Post', 'Delete karo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'groups', groupId, 'posts', post.id)).catch(() => {}) },
    ]);
  };

  const goToProfile = (authorId) => {
    if (authorId === user?.uid) return;
    navigation.navigate('UserProfile', { userId: authorId });
  };

  const pickPostMedia = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.85, videoMaxDuration: 120,
    });
    if (!r.canceled && r.assets[0]) { setPostMedia(r.assets[0]); setPostMediaType(type); }
  };

  const addPostTag = () => {
    const t = postTagInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!t || postTags.includes(t) || postTags.length >= 5) return;
    setPostTags(p => [...p, t]); setPostTagInput('');
  };

  // Render chat message
  const renderMessage = ({ item, index }) => {
    const isMe = item.senderId === user?.uid;
    const prev = index > 0 ? messages[index - 1] : null;
    const showMeta = !prev || prev.senderId !== item.senderId;
    return (
      <View style={[S.msgWrap, isMe && S.myMsgWrap]}>
        {!isMe && (showMeta
          ? <TouchableOpacity onPress={() => goToProfile(item.senderId)}>
              {item.senderPhoto
                ? <Image source={{ uri: item.senderPhoto }} style={S.msgAva} />
                : <View style={[S.msgAva, { backgroundColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{(item.senderName || 'U')[0].toUpperCase()}</Text>
                  </View>}
            </TouchableOpacity>
          : <View style={{ width: 34 }} />
        )}
        <View style={[S.bubbleCol, isMe && { alignItems: 'flex-end' }]}>
          {showMeta && !isMe && (
            <TouchableOpacity onPress={() => goToProfile(item.senderId)}>
              <Text style={[S.senderName, { color: colors.primary }]}>{item.senderName}</Text>
            </TouchableOpacity>
          )}
          <View style={[S.bubble, isMe ? [{ backgroundColor: colors.primary }, S.myBubble] : [{ backgroundColor: colors.card }, S.theirBubble]]}>
            {item.mediaUrl ? <Image source={{ uri: item.mediaUrl }} style={S.msgImg} resizeMode="cover" /> : null}
            {item.text ? <Text style={[S.bubbleTxt, { color: isMe ? '#FFF' : colors.text }]}>{item.text}</Text> : null}
            <Text style={[S.msgTime, { color: isMe ? '#FFFFFF60' : colors.textSecondary }]}>
              {item.createdAt ? moment(item.createdAt.toDate()).format('HH:mm') : ''}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Render group post
  const renderPost = ({ item }) => {
    if (item.deleted) return null;
    const likes = Array.isArray(item.likes) ? item.likes : [];
    const liked = likes.includes(user?.uid);
    const isOwner = item.authorId === user?.uid;
    const isExpanded = expandedPost === item.id;
    const comments = postComments[item.id] || [];
    const typeInfo = POST_TYPES.find(t => t.id === item.type) || POST_TYPES[0];
    const contentText = item.content || item.text || '';
    const mediaUrl = item.mediaUrl || item.imageUrl || '';

    return (
      <View style={[S.postCard, { backgroundColor: colors.card }]}>
        <View style={S.postHead}>
          <TouchableOpacity style={S.postAuthorRow} onPress={() => goToProfile(item.authorId)} activeOpacity={0.8}>
            {item.authorPhoto
              ? <Image source={{ uri: item.authorPhoto }} style={S.postAva} />
              : <View style={[S.postAva, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>{(item.authorName || 'U')[0].toUpperCase()}</Text>
                </View>}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[S.postAuthorName, { color: colors.text }]}>{item.authorName}</Text>
                <View style={[S.typeBadge, { backgroundColor: typeInfo.color + '20' }]}>
                  <Ionicons name={typeInfo.icon} size={10} color={typeInfo.color} />
                  <Text style={[S.typeBadgeTxt, { color: typeInfo.color }]}>{typeInfo.label}</Text>
                </View>
              </View>
              <Text style={[S.postMeta, { color: colors.textSecondary }]}>
                {item.authorDept ? `${item.authorDept} • ` : ''}{item.createdAt ? moment(item.createdAt.toDate()).fromNow() : 'just now'}
              </Text>
            </View>
          </TouchableOpacity>
          {(isOwner || isGroupAdmin) && (
            <TouchableOpacity onPress={() => deletePost(item)} style={S.deleteBtn}>
              <Ionicons name="trash-outline" size={17} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>

        {item.title ? <Text style={[S.postTitle, { color: colors.text }]}>{item.title}</Text> : null}
        {contentText ? <Text style={[S.postContent, { color: colors.text }]}>{contentText}</Text> : null}

        {mediaUrl ? (
          item.mediaType === 'video'
            ? <Video source={{ uri: mediaUrl }} style={S.postVideo} resizeMode={ResizeMode.COVER} useNativeControls shouldPlay={false} />
            : <Image source={{ uri: mediaUrl }} style={S.postImg} resizeMode="cover" />
        ) : null}

        {item.tags?.length > 0 && (
          <View style={S.tagsRow}>
            {item.tags.map(tag => (
              <View key={tag} style={[S.tagChip, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[S.tagTxt, { color: colors.primary }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {(likes.length > 0 || item.commentsCount > 0) && (
          <View style={[S.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            {likes.length > 0 && (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={S.likeIcon}><Ionicons name="heart" size={10} color="#FFF" /></View>
                <Text style={[S.statsTxt, { color: colors.textSecondary }]}>{likes.length}</Text>
              </View>
            )}
            {likes.length === 0 && <View style={{ flex: 1 }} />}
            {item.commentsCount > 0 && (
              <TouchableOpacity onPress={() => toggleExpand(item.id)}>
                <Text style={[S.statsTxt, { color: colors.textSecondary }]}>
                  {item.commentsCount} comment{item.commentsCount !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={S.actionRow}>
          <TouchableOpacity style={S.actionBtn} onPress={() => likePost(item)}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? '#EF4444' : colors.textSecondary} />
            <Text style={[S.actionTxt, { color: liked ? '#EF4444' : colors.textSecondary }]}>Like</Text>
          </TouchableOpacity>
          <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />
          <TouchableOpacity style={S.actionBtn} onPress={() => toggleExpand(item.id)}>
            <Ionicons name={isExpanded ? 'chatbubble' : 'chatbubble-outline'} size={20} color={isExpanded ? colors.primary : colors.textSecondary} />
            <Text style={[S.actionTxt, { color: isExpanded ? colors.primary : colors.textSecondary }]}>Comment</Text>
          </TouchableOpacity>
          <View style={{ width: 1, height: 18, backgroundColor: colors.border }} />
          <TouchableOpacity style={S.actionBtn} onPress={() => goToProfile(item.authorId)}>
            <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
            <Text style={[S.actionTxt, { color: colors.textSecondary }]}>Profile</Text>
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={[S.commentsSection, { borderTopColor: colors.border }]}>
            {comments.map(c => (
              <View key={c.id} style={S.commentRow}>
                <TouchableOpacity onPress={() => goToProfile(c.authorId)}>
                  <View style={[S.commentAva, { backgroundColor: colors.primary + '30', overflow: 'hidden' }]}>
                    {c.authorPhoto
                      ? <Image source={{ uri: c.authorPhoto }} style={{ width: '100%', height: '100%', borderRadius: 15 }} />
                      : <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11 }}>{(c.authorName || 'U')[0].toUpperCase()}</Text>}
                  </View>
                </TouchableOpacity>
                <View style={[S.commentBubble, { backgroundColor: colors.inputBg }]}>
                  <Text style={[S.commentAuthor, { color: colors.primary }]}>{c.authorName}</Text>
                  <Text style={[S.commentTxt, { color: colors.text }]}>{c.text}</Text>
                  <Text style={[S.commentTime, { color: colors.textSecondary }]}>
                    {c.createdAt ? moment(c.createdAt.toDate()).fromNow() : ''}
                  </Text>
                </View>
              </View>
            ))}
            {isMember && (
              <View style={S.addCommentRow}>
                {profile?.photoURL
                  ? <Image source={{ uri: profile.photoURL }} style={S.commentAva} />
                  : <View style={[S.commentAva, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 11 }}>{(profile?.name || 'U')[0].toUpperCase()}</Text>
                    </View>}
                <View style={[S.commentInputWrap, { backgroundColor: colors.inputBg }]}>
                  <TextInput
                    style={[S.commentInputField, { color: colors.text }]}
                    placeholder="Write a comment..."
                    placeholderTextColor={colors.textSecondary}
                    value={commentTexts[item.id] || ''}
                    onChangeText={v => setCommentTexts(p => ({ ...p, [item.id]: v }))}
                    onSubmitEditing={() => addComment(item.id)}
                    returnKeyType="send"
                  />
                  <TouchableOpacity onPress={() => addComment(item.id)} disabled={!(commentTexts[item.id] || '').trim() || submittingComment}>
                    {submittingComment
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Ionicons name="send" size={18} color={(commentTexts[item.id] || '').trim() ? colors.primary : colors.border} />}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Loading
  if (loadingGroup && !group) return (
    <View style={[S.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  // Not a member
  if (!isMember) {
    return (
      <View style={[S.container, { backgroundColor: colors.background }]}>
        <View style={[S.header, { backgroundColor: colors.primary }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <View style={S.headerInfo}>
            <View style={[S.headerEmoji, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={{ fontSize: 18 }}>{group?.emoji || '🎓'}</Text>
            </View>
            <Text style={S.headerTitle} numberOfLines={1}>{group?.name || 'Group'}</Text>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>{group?.emoji || '🎓'}</Text>
          <Text style={[{ fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' }]}>{group?.name}</Text>
          {group?.description ? (
            <Text style={[{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 16 }]}>{group.description}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 20, marginBottom: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{group?.membersCount || 0} members</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={group?.isPrivate ? 'lock-closed-outline' : 'globe-outline'} size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{group?.isPrivate ? 'Private' : 'Public'}</Text>
            </View>
          </View>
          {hasPendingRequest ? (
            <View style={[S.pendingBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Request Pending...</Text>
            </View>
          ) : (
            <TouchableOpacity style={[S.joinBtn, { backgroundColor: colors.primary }]} onPress={handleJoin} disabled={joiningGroup}>
              {joiningGroup
                ? <ActivityIndicator color="#FFF" />
                : <>
                    <Ionicons name={group?.isPrivate ? 'lock-open-outline' : 'people'} size={20} color="#FFF" />
                    <Text style={S.joinBtnTxt}>{group?.isPrivate ? 'Request to Join' : 'Join Group'}</Text>
                  </>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Member view
  return (
    <KeyboardAvoidingView style={[S.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[S.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={S.headerInfo}>
          <View style={[S.headerEmoji, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={{ fontSize: 18 }}>{group?.emoji || '🎓'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={S.headerTitle} numberOfLines={1}>{group?.name || 'Group'}</Text>
              {group?.isPrivate && <Ionicons name="lock-closed" size={11} color="#FFFFFF90" />}
            </View>
            <Text style={S.headerSub}>{group?.membersCount || 0} members</Text>
          </View>
        </View>
        <TouchableOpacity style={{ padding: 6 }} onPress={() => navigation.navigate('GroupSettings', { groupId })}>
          <Ionicons name="information-circle-outline" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={[S.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[['chat', 'chatbubbles-outline', 'Chat'], ['posts', 'newspaper-outline', 'Posts']].map(([id, icon, label]) => (
          <TouchableOpacity
            key={id}
            style={[S.tab, activeTab === id && { borderBottomWidth: 2.5, borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(id)}
          >
            <Ionicons name={icon} size={17} color={activeTab === id ? colors.primary : colors.textSecondary} />
            <Text style={[S.tabTxt, { color: activeTab === id ? colors.primary : colors.textSecondary }]}>{label}</Text>
            {id === 'posts' && groupPosts.filter(p => !p.deleted).length > 0 && (
              <View style={[S.tabBadge, { backgroundColor: colors.primary }]}>
                <Text style={S.tabBadgeTxt}>{groupPosts.filter(p => !p.deleted).length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {uploading && (
        <View style={[S.uploadBar, { backgroundColor: colors.primary }]}>
          <ActivityIndicator size="small" color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>Uploading...</Text>
        </View>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <>
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={i => i.id}
            renderItem={renderMessage}
            contentContainerStyle={S.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={S.emptyWrap}>
                <Text style={{ fontSize: 44 }}>{group?.emoji || '💬'}</Text>
                <Text style={[S.emptyTitle, { color: colors.text }]}>Start the conversation!</Text>
                <Text style={[S.emptySub, { color: colors.textSecondary }]}>Pehla message bhejo 👋</Text>
              </View>
            }
          />
          <View style={[S.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TouchableOpacity style={[S.iconBtn, { backgroundColor: colors.inputBg }]} onPress={sendImageChat}>
              <Ionicons name="image-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={[S.chatInput, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="Message..." placeholderTextColor={colors.textSecondary}
              value={msgText} onChangeText={setMsgText} multiline maxLength={1000}
            />
            <TouchableOpacity
              style={[S.sendBtn, { backgroundColor: msgText.trim() ? colors.primary : colors.border }]}
              onPress={sendMessage} disabled={!msgText.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={17} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <>
          <TouchableOpacity style={[S.writeBar, { backgroundColor: colors.primary }]} onPress={() => setPostModal(true)} activeOpacity={0.88}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              {profile?.photoURL
                ? <Image source={{ uri: profile.photoURL }} style={S.writeBarAva} />
                : <View style={[S.writeBarAva, { backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>{(profile?.name || 'U')[0].toUpperCase()}</Text>
                  </View>}
              <Text style={S.writeBarTxt}>What's on your mind?</Text>
            </View>
            <View style={S.writeBarIcon}>
              <Ionicons name="create" size={18} color="#FFF" />
            </View>
          </TouchableOpacity>

          <View style={[S.quickRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {POST_TYPES.map(pt => (
              <TouchableOpacity key={pt.id} style={S.quickBtn} onPress={() => { setPostType(pt.id); setPostModal(true); }}>
                <Ionicons name={pt.icon} size={17} color={pt.color} />
                <Text style={[S.quickBtnTxt, { color: colors.textSecondary }]}>{pt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loadingPosts ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={groupPosts.filter(p => p.deleted !== true)}
              keyExtractor={i => i.id}
              renderItem={renderPost}
              contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
              extraData={[expandedPost, postComments, commentTexts]}
              ListEmptyComponent={
                <View style={S.emptyWrap}>
                  <Text style={{ fontSize: 48 }}>📝</Text>
                  <Text style={[S.emptyTitle, { color: colors.text }]}>No posts yet</Text>
                  <Text style={[S.emptySub, { color: colors.textSecondary }]}>Pehla post karo!</Text>
                  <TouchableOpacity style={[S.emptyPostBtn, { backgroundColor: colors.primary }]} onPress={() => setPostModal(true)}>
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700', marginLeft: 6 }}>Create Post</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}
        </>
      )}

      {/* Create Post Modal */}
      <Modal visible={postModal} animationType="slide" onRequestClose={() => setPostModal(false)}>
        <KeyboardAvoidingView style={[S.modalWrap, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[S.modalHead, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setPostModal(false); setPostMedia(null); setPostTags([]); }}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[S.modalTitle, { color: colors.text }]}>Create Post</Text>
            <TouchableOpacity
              style={[S.modalPostBtn, { backgroundColor: (postContent.trim() || postMedia) ? colors.primary : colors.border }]}
              onPress={createPost}
              disabled={posting || (!postContent.trim() && !postMedia)}
            >
              {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Post</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={S.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {profile?.photoURL
                ? <Image source={{ uri: profile.photoURL }} style={S.modalAva} />
                : <View style={[S.modalAva, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 18 }}>{(profile?.name || 'U')[0].toUpperCase()}</Text>
                  </View>}
              <View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{profile?.name || 'You'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>{group?.name} • {group?.isPrivate ? '🔒 Private' : '🌐 Public'}</Text>
                </View>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {POST_TYPES.map(pt => (
                <TouchableOpacity
                  key={pt.id}
                  style={[S.typeBtn, { borderColor: postType === pt.id ? pt.color : colors.border, backgroundColor: postType === pt.id ? pt.color + '15' : 'transparent' }]}
                  onPress={() => setPostType(pt.id)}
                >
                  <Ionicons name={pt.icon} size={15} color={postType === pt.id ? pt.color : colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: postType === pt.id ? pt.color : colors.textSecondary, fontWeight: '600' }}>{pt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[S.titleInput, { color: colors.text, borderBottomColor: colors.border }]}
              placeholder="Title (optional)"
              placeholderTextColor={colors.textSecondary}
              value={postTitle}
              onChangeText={setPostTitle}
              maxLength={100}
            />

            <TextInput
              style={[S.contentInput, { color: colors.text }]}
              placeholder={postType === 'question' ? 'Apna question detail mein likho...' : postType === 'announcement' ? 'Announcement likho...' : 'Kya share karna chahte ho?'}
              placeholderTextColor={colors.textSecondary}
              value={postContent}
              onChangeText={setPostContent}
              multiline
              maxLength={2000}
            />

            {postMedia && (
              <View style={{ position: 'relative', marginBottom: 14 }}>
                {postMediaType === 'image'
                  ? <Image source={{ uri: postMedia.uri }} style={{ width: '100%', height: 220, borderRadius: 14 }} resizeMode="cover" />
                  : <View style={{ backgroundColor: colors.inputBg, borderRadius: 14, height: 130, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="videocam" size={36} color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Video selected ✓</Text>
                    </View>}
                <TouchableOpacity style={{ position: 'absolute', top: 10, right: 10 }} onPress={() => { setPostMedia(null); setPostMediaType(null); }}>
                  <Ionicons name="close-circle" size={28} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}

            <View style={[S.mediaRow, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 }}>📎 Add to post:</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[S.mediaBtn, { backgroundColor: '#10B98115' }]} onPress={() => pickPostMedia('image')}>
                  <Ionicons name="image" size={20} color="#10B981" />
                  <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600' }}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.mediaBtn, { backgroundColor: '#F59E0B15' }]} onPress={() => pickPostMedia('video')}>
                  <Ionicons name="videocam" size={20} color="#F59E0B" />
                  <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.mediaBtn, { backgroundColor: colors.primary + '15' }]}
                  onPress={async () => {
                    const { status } = await ImagePicker.requestCameraPermissionsAsync();
                    if (status !== 'granted') return;
                    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
                    if (!r.canceled) { setPostMedia(r.assets[0]); setPostMediaType('image'); }
                  }}>
                  <Ionicons name="camera" size={20} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Camera</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[S.tagsSection, { borderColor: colors.border }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 }}>🏷️ Tags (up to 5)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[S.tagInputField, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                  placeholder="e.g. exam, notes..."
                  placeholderTextColor={colors.textSecondary}
                  value={postTagInput}
                  onChangeText={setPostTagInput}
                  onSubmitEditing={addPostTag}
                  returnKeyType="done"
                  autoCapitalize="none"
                />
                <TouchableOpacity style={[S.addTagBtn, { backgroundColor: postTagInput.trim() ? colors.primary : colors.border }]} onPress={addPostTag}>
                  <Text style={{ color: '#FFF', fontWeight: '700' }}>Add</Text>
                </TouchableOpacity>
              </View>
              {postTags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {postTags.map(tag => (
                    <TouchableOpacity key={tag} style={[S.tagChip, { backgroundColor: colors.primary + '15' }]} onPress={() => setPostTags(p => p.filter(t => t !== tag))}>
                      <Text style={[S.tagTxt, { color: colors.primary }]}>#{tag}</Text>
                      <Ionicons name="close" size={12} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={{ height: 60 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 54 : 44, paddingBottom: 14, gap: 10 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', maxWidth: 200, flex: 1 },
  headerSub: { color: '#FFFFFF90', fontSize: 11, marginTop: 1 },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 30, borderRadius: 18, borderWidth: 1 },
  joinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 40, borderRadius: 18 },
  joinBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, gap: 6, position: 'relative' },
  tabTxt: { fontSize: 13, fontWeight: '600' },
  tabBadge: { position: 'absolute', top: 8, right: 10, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeTxt: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  uploadBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  msgList: { padding: 12, paddingBottom: 16 },
  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, gap: 6 },
  myMsgWrap: { flexDirection: 'row-reverse' },
  msgAva: { width: 34, height: 34, borderRadius: 17 },
  bubbleCol: { maxWidth: '75%' },
  senderName: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 10 },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, overflow: 'hidden' },
  myBubble: { borderRadius: 18, borderBottomRightRadius: 4 },
  theirBubble: { borderRadius: 18, borderBottomLeftRadius: 4 },
  msgImg: { width: 200, height: 160, borderRadius: 10, marginBottom: 4 },
  bubbleTxt: { fontSize: 15, lineHeight: 21 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chatInput: { flex: 1, borderRadius: 22, paddingHorizontal: 15, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyPostBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 6 },
  writeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 10, padding: 14, borderRadius: 16, elevation: 2 },
  writeBarAva: { width: 34, height: 34, borderRadius: 17 },
  writeBarTxt: { color: 'rgba(255,255,255,0.88)', fontSize: 14, flex: 1 },
  writeBarIcon: { backgroundColor: 'rgba(255,255,255,0.2)', width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderBottomWidth: 1 },
  quickBtn: { alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  quickBtnTxt: { fontSize: 10, fontWeight: '600' },
  postCard: { marginBottom: 8, overflow: 'hidden' },
  postHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 10 },
  postAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  postAva: { width: 44, height: 44, borderRadius: 22 },
  postAuthorName: { fontSize: 15, fontWeight: '700' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  typeBadgeTxt: { fontSize: 10, fontWeight: '700' },
  postMeta: { fontSize: 12 },
  deleteBtn: { padding: 8 },
  postTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: 14, paddingBottom: 6, lineHeight: 23 },
  postContent: { fontSize: 15, lineHeight: 23, paddingHorizontal: 14, paddingBottom: 12 },
  postImg: { width: '100%', height: 260 },
  postVideo: { width: '100%', height: 220 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  tagTxt: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  likeIcon: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  statsTxt: { fontSize: 13 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  actionTxt: { fontSize: 14, fontWeight: '600' },
  commentsSection: { borderTopWidth: 0.5, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12 },
  commentRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  commentAva: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  commentBubble: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  commentAuthor: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  commentTxt: { fontSize: 14, lineHeight: 20 },
  commentTime: { fontSize: 10, marginTop: 4 },
  addCommentRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  commentInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22, gap: 8 },
  commentInputField: { flex: 1, fontSize: 14 },
  modalWrap: { flex: 1 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 46, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  modalPostBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
  modalBody: { padding: 16 },
  modalAva: { width: 48, height: 48, borderRadius: 24 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, marginRight: 8 },
  titleInput: { fontSize: 18, fontWeight: '700', paddingVertical: 10, borderBottomWidth: 1, marginBottom: 12 },
  contentInput: { fontSize: 16, lineHeight: 26, minHeight: 120, marginBottom: 14 },
  mediaRow: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  mediaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  tagsSection: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  tagInputField: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addTagBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});