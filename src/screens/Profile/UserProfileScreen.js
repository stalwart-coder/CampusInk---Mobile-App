// src/screens/Profile/UserProfileScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, FlatList, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  doc, getDoc, updateDoc, increment, setDoc, deleteDoc,
  collection, query, where, orderBy, getDocs,
  arrayUnion, arrayRemove, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LEADERBOARD_BADGES } from '../../constants';
import PostCard from '../../components/post/PostCard';

const { width: W } = Dimensions.get('window');
const REEL_SIZE = (W - 3) / 3;

// Follow request status
const FR_STATUS = { NONE: 'none', PENDING: 'pending', FOLLOWING: 'following' };

export default function UserProfileScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { user, refreshProfile } = useAuth();

  const userId = route?.params?.userId;

  const [userProfile,   setUserProfile]   = useState(null);
  const [blogs,         setBlogs]         = useState([]);
  const [reels,         setReels]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [followStatus,  setFollowStatus]  = useState(FR_STATUS.NONE);
  const [followLoading, setFollowLoading] = useState(false);
  const [isBlocked,     setIsBlocked]     = useState(false);
  const [activeTab,     setActiveTab]     = useState('blogs');
  const [loadingContent,setLoadingContent]= useState(false);

  // incoming follow requests (for target user to see)
  const [incomingRequests, setIncomingRequests] = useState([]);

  const isOwnProfile = userId === user?.uid;

  useEffect(() => {
    if (!userId) { navigation.goBack(); return; }
    loadAll();
  }, [userId]);

  // ── Listen to incoming follow requests (only if viewing own profile) ──────
  useEffect(() => {
    if (!user || !isOwnProfile) return;
    const q = query(
      collection(db, 'followRequests'),
      where('targetId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(q, snap => {
      setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user, isOwnProfile]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // 1. Load profile
      const snap = await getDoc(doc(db, 'users', userId));
      if (!snap.exists()) { setLoading(false); return; }
      const profileData = { id: snap.id, ...snap.data() };
      setUserProfile(profileData);

      // 2. Load relationship
      if (user && !isOwnProfile) {
        const mySnap = await getDoc(doc(db, 'users', user.uid));
        const myData = mySnap.data() || {};

        // Check blocked
        if ((myData.blockedUsers || []).includes(userId)) {
          setIsBlocked(true);
          setLoading(false);
          return;
        }

        // Check follow status
        if ((myData.following || []).includes(userId)) {
          setFollowStatus(FR_STATUS.FOLLOWING);
        } else {
          // Check pending request
          const reqSnap = await getDoc(doc(db, 'followRequests', `${user.uid}_${userId}`));
          if (reqSnap.exists() && reqSnap.data().status === 'pending') {
            setFollowStatus(FR_STATUS.PENDING);
          } else {
            setFollowStatus(FR_STATUS.NONE);
          }
        }
      }

      // 3. Load content based on privacy
      const isPrivate = profileData?.privacy?.privateAccount;
      const canView = !isPrivate || followStatus === FR_STATUS.FOLLOWING || isOwnProfile;

      if (canView || !isPrivate) {
        await loadContent(profileData?.privacy?.privateAccount);
      }

    } catch (e) {
      console.error('UserProfile load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async (isPrivate) => {
    if (!userId) return;
    // If private and not following, don't load
    if (isPrivate && followStatus !== FR_STATUS.FOLLOWING && !isOwnProfile) return;

    setLoadingContent(true);
    try {
      // ── FIX: Fresh isolated fetch — never reuse global state ─────────────

      // Load blogs — only this user's posts
      try {
        const bq = query(
          collection(db, 'posts'),
          where('authorId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const bSnap = await getDocs(bq);
        setBlogs(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // Fallback without orderBy if index missing
        const bq2 = query(collection(db, 'posts'), where('authorId', '==', userId));
        const bSnap2 = await getDocs(bq2);
        setBlogs(
          bSnap2.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        );
      }

      // ── FIX: Load reels — only this specific user's reels ────────────────
      // NEVER use global reels state or home feed data
      try {
        const rq = query(
          collection(db, 'reels'),
          where('authorId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const rSnap = await getDocs(rq);
        setReels(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // Fallback without orderBy if index missing
        const rq2 = query(collection(db, 'reels'), where('authorId', '==', userId));
        const rSnap2 = await getDocs(rq2);
        setReels(
          rSnap2.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        );
      }

    } catch (e) {
      console.error('loadContent:', e);
    } finally {
      setLoadingContent(false);
    }
  };

  // ── Follow / Unfollow / Request ───────────────────────────────────────────
  const handleFollow = async () => {
    if (!user || isOwnProfile || followLoading) return;
    setFollowLoading(true);
    try {
      const isPrivate = userProfile?.privacy?.privateAccount;

      if (followStatus === FR_STATUS.FOLLOWING) {
        // ── Unfollow ──────────────────────────────────────────────────────
        setFollowStatus(FR_STATUS.NONE);
        setUserProfile(p => ({ ...p, followersCount: Math.max(0, (p?.followersCount || 1) - 1) }));
        await updateDoc(doc(db, 'users', user.uid), {
          following: arrayRemove(userId),
          followingCount: increment(-1),
        });
        await updateDoc(doc(db, 'users', userId), {
          followers: arrayRemove(user.uid),
          followersCount: increment(-1),
        });
        setBlogs([]);
        setReels([]);

      } else if (followStatus === FR_STATUS.PENDING) {
        // ── Cancel request ────────────────────────────────────────────────
        setFollowStatus(FR_STATUS.NONE);
        await deleteDoc(doc(db, 'followRequests', `${user.uid}_${userId}`));

      } else if (isPrivate) {
        // ── Send follow request ───────────────────────────────────────────
        setFollowStatus(FR_STATUS.PENDING);
        await setDoc(doc(db, 'followRequests', `${user.uid}_${userId}`), {
          requesterId: user.uid,
          requesterName: user.displayName || 'User',
          requesterPhoto: user.photoURL || '',
          targetId: userId,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        // Send notification
        await setDoc(doc(collection(db, 'notifications')), {
          userId: userId,
          type: 'follow_request',
          title: 'New Follow Request',
          body: `${user.displayName || 'Someone'} aapko follow karna chahta hai`,
          requesterId: user.uid,
          read: false,
          createdAt: serverTimestamp(),
        });

      } else {
        // ── Direct follow (public account) ────────────────────────────────
        setFollowStatus(FR_STATUS.FOLLOWING);
        setUserProfile(p => ({ ...p, followersCount: (p?.followersCount || 0) + 1 }));
        await updateDoc(doc(db, 'users', user.uid), {
          following: arrayUnion(userId),
          followingCount: increment(1),
        });
        await updateDoc(doc(db, 'users', userId), {
          followers: arrayUnion(user.uid),
          followersCount: increment(1),
        });
        // Load content after following
        await loadContent(false);
      }

      if (refreshProfile) refreshProfile();
    } catch (e) {
      Alert.alert('Error', 'Action failed. Try again.');
      setFollowStatus(FR_STATUS.NONE);
    } finally {
      setFollowLoading(false);
    }
  };

  // ── Accept follow request ─────────────────────────────────────────────────
  const acceptRequest = async (request) => {
    try {
      // Add to following/followers
      await updateDoc(doc(db, 'users', request.requesterId), {
        following: arrayUnion(user.uid),
        followingCount: increment(1),
      });
      await updateDoc(doc(db, 'users', user.uid), {
        followers: arrayUnion(request.requesterId),
        followersCount: increment(1),
      });
      // Update request status
      await updateDoc(doc(db, 'followRequests', request.id), {
        status: 'accepted',
      });
      // Notify requester
      await setDoc(doc(collection(db, 'notifications')), {
        userId: request.requesterId,
        type: 'follow_accepted',
        title: 'Follow Request Accepted! 🎉',
        body: `${user.displayName || 'User'} ne aapki follow request accept kar li`,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert('Error', 'Could not accept request.');
    }
  };

  // ── Reject follow request ─────────────────────────────────────────────────
  const rejectRequest = async (request) => {
    try {
      await updateDoc(doc(db, 'followRequests', request.id), {
        status: 'rejected',
      });
    } catch (e) {
      Alert.alert('Error', 'Could not reject request.');
    }
  };

  // ── Block ─────────────────────────────────────────────────────────────────
  const doBlockAction = useCallback(async () => {
    if (!userProfile || !user) return;
    const name = userProfile.name || 'User';
    try {
      if (isBlocked) {
        await updateDoc(doc(db, 'users', user.uid), { blockedUsers: arrayRemove(userId) });
        setIsBlocked(false);
        Alert.alert('✅ Unblocked', `${name} ko unblock kar diya.`);
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
          blockedUsers: arrayUnion(userId),
          following: arrayRemove(userId),
        });
        await updateDoc(doc(db, 'users', userId), {
          followers: arrayRemove(user.uid),
        });
        setIsBlocked(true);
        setFollowStatus(FR_STATUS.NONE);
        Alert.alert('🚫 Blocked', `${name} ko block kar diya.`);
      }
      if (refreshProfile) refreshProfile();
    } catch (_) { Alert.alert('Error', 'Action failed.'); }
  }, [userProfile, isBlocked, userId, user]);

  const showOptions = useCallback(() => {
    if (!userProfile) return;
    const name = userProfile.name || 'User';
    Alert.alert(name, 'Choose an action:', [
      {
        text: isBlocked ? '✅ Unblock User' : '🚫 Block User',
        onPress: () => Alert.alert(
          isBlocked ? 'Unblock' : 'Block',
          isBlocked ? `${name} ko unblock karna chahte ho?` : `${name} ko block karo?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: isBlocked ? 'Unblock' : 'Block', style: 'destructive', onPress: doBlockAction },
          ]
        ),
      },
      { text: '🚩 Report User', onPress: () => Alert.alert('Reported', 'Humari team review karegi.') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [userProfile, isBlocked, doBlockAction]);

  // ── Follow button label ───────────────────────────────────────────────────
  const followBtnLabel = () => {
    if (followStatus === FR_STATUS.FOLLOWING) return '✓ Following';
    if (followStatus === FR_STATUS.PENDING)   return '⏳ Requested';
    return '+ Follow';
  };

  const followBtnColor = () => {
    if (followStatus === FR_STATUS.FOLLOWING) return colors.inputBg;
    if (followStatus === FR_STATUS.PENDING)   return colors.inputBg;
    return colors.primary;
  };

  // ── Can view content? ─────────────────────────────────────────────────────
  const isPrivateAccount = userProfile?.privacy?.privateAccount;
  const canViewContent = !isPrivateAccount
    || followStatus === FR_STATUS.FOLLOWING
    || isOwnProfile;

  // ── Reel grid item ────────────────────────────────────────────────────────
  const renderReelItem = ({ item, index }) => (
    <TouchableOpacity
      style={S.reelThumb}
      onPress={() => navigation.navigate('ProfileReels', {
        reels: reels,         // pass ONLY this user's reels
        startIndex: index,    // start from clicked reel
        userId: userId,
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
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{item.likesCount || 0}</Text>
      </View>
    </TouchableOpacity>
  );

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={[S.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );

  if (!userId) return null;

  if (!userProfile) return (
    <View style={[S.center, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={S.absBack} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={{ fontSize: 44, marginBottom: 12 }}>🔍</Text>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>User not found</Text>
      <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 14 }}>
        <Text style={{ color: colors.primary, fontSize: 15 }}>← Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  if (isBlocked) return (
    <View style={[S.center, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={S.absBack} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>🚫</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 }}>User Blocked</Text>
      <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 }}>
        Aapne {userProfile.name || 'is user'} ko block kar rakha hai.
      </Text>
      <TouchableOpacity
        style={{ marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
        onPress={doBlockAction}
      >
        <Text style={{ color: '#FFF', fontWeight: '700' }}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );

  const displayName = userProfile.name || userProfile.displayName || 'Campus User';
  const badge = LEADERBOARD_BADGES.slice().reverse().find(b => (userProfile.points || 0) >= b.min);

  const stats = [
    { label: 'Blogs',     value: blogs.length || userProfile.postsCount || 0 },
    { label: 'Followers', value: userProfile.followersCount || 0 },
    { label: 'Following', value: userProfile.followingCount || 0 },
    { label: 'Points',    value: userProfile.points || 0 },
  ];

  return (
    <ScrollView
      style={[S.container, { backgroundColor: colors.background }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Banner */}
      <View style={S.bannerWrap}>
        {userProfile.bannerURL
          ? <Image source={{ uri: userProfile.bannerURL }} style={S.banner} resizeMode="cover" />
          : <View style={[S.banner, { backgroundColor: colors.primary }]} />
        }
        <TouchableOpacity style={S.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        {!isOwnProfile && (
          <TouchableOpacity style={S.optionsBtn} onPress={showOptions}>
            <Ionicons name="ellipsis-vertical" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Profile info */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <View style={{ marginTop: -44 }}>
            {userProfile.photoURL
              ? <Image source={{ uri: userProfile.photoURL }} style={S.avatar} />
              : <View style={[S.avatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 32, color: '#FFF', fontWeight: '800' }}>
                    {displayName[0].toUpperCase()}
                  </Text>
                </View>
            }
            {userProfile.isVerified && (
              <View style={{ position: 'absolute', bottom: 2, right: 2, backgroundColor: '#FFF', borderRadius: 11 }}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
              </View>
            )}
          </View>

          {/* Follow button */}
          {!isOwnProfile && (
            <TouchableOpacity
              style={[S.followBtn, {
                backgroundColor: followBtnColor(),
                borderColor: followStatus === FR_STATUS.NONE ? colors.primary : colors.border,
              }]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading
                ? <ActivityIndicator size="small" color={followStatus === FR_STATUS.NONE ? '#FFF' : colors.text} />
                : <Text style={{ fontWeight: '700', fontSize: 14, color: followStatus === FR_STATUS.NONE ? '#FFF' : colors.text }}>
                    {followBtnLabel()}
                  </Text>
              }
            </TouchableOpacity>
          )}
        </View>

        <Text style={{ fontSize: 21, fontWeight: '800', color: colors.text, marginBottom: 2 }}>
          {displayName}
        </Text>
        {isPrivateAccount && !canViewContent && (
          <View style={[S.privateBadge, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
            <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '500' }}>Private Account</Text>
          </View>
        )}
        {userProfile.username
          ? <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 2 }}>@{userProfile.username}</Text>
          : null
        }
        {(userProfile.department || userProfile.college) && (
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 6 }}>
            {[userProfile.department, userProfile.year, userProfile.college].filter(Boolean).join(' · ')}
          </Text>
        )}
        {badge && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 8, backgroundColor: colors.primary + '20' }}>
            <Text style={{ fontWeight: '700', fontSize: 12, color: colors.primary }}>{badge.badge}</Text>
          </View>
        )}
        {userProfile.bio
          ? <Text style={{ fontSize: 14, lineHeight: 21, color: colors.text, marginBottom: 8 }}>{userProfile.bio}</Text>
          : null
        }
      </View>

      {/* Stats */}
      <View style={[S.statsRow, { backgroundColor: colors.card }]}>
        {stats.map((s, i) => (
          <View key={i} style={[S.statItem, i < 3 && { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
              {s.value >= 1000 ? `${(s.value / 1000).toFixed(1)}k` : s.value}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 2, color: colors.textSecondary }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Incoming follow requests (own profile only) */}
      {isOwnProfile && incomingRequests.length > 0 && (
        <View style={[S.requestsSection, { backgroundColor: colors.card }]}>
          <Text style={[S.requestsTitle, { color: colors.text }]}>
            📬 Follow Requests ({incomingRequests.length})
          </Text>
          {incomingRequests.map(req => (
            <View key={req.id} style={[S.requestRow, { borderBottomColor: colors.border }]}>
              <View style={[S.requestAvatar, { backgroundColor: colors.primary }]}>
                {req.requesterPhoto
                  ? <Image source={{ uri: req.requesterPhoto }} style={{ width: '100%', height: '100%', borderRadius: 20 }} />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {(req.requesterName || 'U')[0].toUpperCase()}
                    </Text>
                }
              </View>
              <Text style={[{ flex: 1, fontWeight: '500', color: colors.text }]} numberOfLines={1}>
                {req.requesterName || 'User'}
              </Text>
              <TouchableOpacity style={[S.reqBtn, { backgroundColor: colors.primary }]} onPress={() => acceptRequest(req)}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[S.reqBtn, { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => rejectRequest(req)}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Reject</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Private account wall */}
      {isPrivateAccount && !canViewContent && !isOwnProfile ? (
        <View style={S.privateWall}>
          <Ionicons name="lock-closed" size={48} color={colors.textSecondary} />
          <Text style={[S.privateTitle, { color: colors.text }]}>Private Account</Text>
          <Text style={[S.privateSub, { color: colors.textSecondary }]}>
            {followStatus === FR_STATUS.PENDING
              ? 'Follow request bhej di hai. Accept hone ka wait karo.'
              : 'Is user ka content dekhne ke liye pehle follow karo.'}
          </Text>
        </View>
      ) : (
        <>
          {/* Tabs */}
          <View style={[S.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            {[
              ['blogs',  'document-text-outline', 'Blogs'],
              ['reels',  'play-circle-outline',   'Reels'],
              ['about',  'information-circle-outline', 'About'],
            ].map(([id, icon, label]) => (
              <TouchableOpacity
                key={id}
                style={[S.tabItem, activeTab === id && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}
                onPress={() => setActiveTab(id)}
              >
                <Ionicons name={icon} size={17} color={activeTab === id ? colors.primary : colors.textSecondary} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: activeTab === id ? colors.primary : colors.textSecondary }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Blogs tab */}
          {activeTab === 'blogs' && (
            loadingContent
              ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
              : blogs.length === 0
                ? <View style={{ alignItems: 'center', paddingTop: 50 }}>
                    <Text style={{ fontSize: 40 }}>📝</Text>
                    <Text style={{ color: colors.textSecondary, marginTop: 10 }}>No blogs yet</Text>
                  </View>
                : blogs.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
                    />
                  ))
          )}

          {/* Reels tab */}
          {activeTab === 'reels' && (
            loadingContent
              ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
              : reels.length === 0
                ? <View style={{ alignItems: 'center', paddingTop: 50 }}>
                    <Text style={{ fontSize: 40 }}>🎬</Text>
                    <Text style={{ color: colors.textSecondary, marginTop: 10 }}>No reels yet</Text>
                  </View>
                : <FlatList
                    data={reels}
                    keyExtractor={i => i.id}
                    numColumns={3}
                    scrollEnabled={false}
                    columnWrapperStyle={{ gap: 1.5 }}
                    contentContainerStyle={{ gap: 1.5, paddingTop: 2 }}
                    renderItem={renderReelItem}
                  />
          )}

          {/* About tab */}
          {activeTab === 'about' && (
            <View style={{ margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card }}>
              {[
                { icon: 'business-outline',  label: 'College',    value: userProfile.college },
                { icon: 'book-outline',       label: 'Department', value: userProfile.department },
                { icon: 'calendar-outline',   label: 'Year',       value: userProfile.year },
                { icon: 'logo-instagram',     label: 'Instagram',  value: userProfile.socialLinks?.instagram },
                { icon: 'logo-linkedin',      label: 'LinkedIn',   value: userProfile.socialLinks?.linkedin },
              ].filter(i => i.value).map((item, idx, arr) => (
                <View key={idx} style={{
                  flexDirection: 'row', gap: 14, padding: 14,
                  borderBottomWidth: idx < arr.length - 1 ? 0.5 : 0,
                  borderBottomColor: colors.border,
                }}>
                  <Ionicons name={item.icon} size={18} color={colors.primary} />
                  <View>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 2 }}>{item.label}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{item.value}</Text>
                  </View>
                </View>
              ))}
              {userProfile.createdAt && (
                <View style={{ flexDirection: 'row', gap: 14, padding: 14 }}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 2 }}>Joined</Text>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>
                      {new Date(userProfile.createdAt?.toDate?.() || userProfile.createdAt)
                        .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const S = StyleSheet.create({
  container:     { flex: 1 },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  absBack:       { position: 'absolute', top: 56, left: 16 },
  bannerWrap:    { position: 'relative', height: 150 },
  banner:        { width: '100%', height: 150 },
  backBtn:       { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 8 },
  optionsBtn:    { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 8 },
  avatar:        { width: 82, height: 82, borderRadius: 41, borderWidth: 3, borderColor: '#fff' },
  followBtn:     { paddingHorizontal: 22, paddingVertical: 9, borderRadius: 22, borderWidth: 1.5, minWidth: 120, alignItems: 'center' },
  statsRow:      { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, borderRadius: 16, paddingVertical: 14, elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  statItem:      { flex: 1, alignItems: 'center' },
  tabs:          { flexDirection: 'row', marginTop: 14, borderBottomWidth: 1 },
  tabItem:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  // Private account
  privateBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start', marginBottom: 6 },
  privateWall:   { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 12 },
  privateTitle:  { fontSize: 20, fontWeight: '700' },
  privateSub:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  // Follow requests
  requestsSection: { margin: 16, borderRadius: 16, padding: 14 },
  requestsTitle:   { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  requestRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5 },
  requestAvatar:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  reqBtn:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  // Reel grid
  reelThumb:     { width: REEL_SIZE, height: REEL_SIZE * 1.4, position: 'relative' },
  reelThumbImg:  { width: '100%', height: '100%' },
  reelPlayIcon:  { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 3 },
  reelLikes:     { position: 'absolute', bottom: 4, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
});