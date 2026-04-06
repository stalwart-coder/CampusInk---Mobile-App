// src/screens/Leaderboard/LeaderboardScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { LEADERBOARD_BADGES, POINTS } from '../../constants';

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState(null);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users'),
        orderBy('points', 'desc'),
        limit(100)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() }));
      setUsers(list);
      const myIdx = list.findIndex(u => u.id === user?.uid);
      if (myIdx !== -1) setMyRank(myIdx + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getBadge = (points) =>
    LEADERBOARD_BADGES.slice().reverse().find(b => (points || 0) >= b.min);

  const getRankDisplay = (rank) => {
    if (rank === 1) return { emoji: '🥇', color: '#FFD700' };
    if (rank === 2) return { emoji: '🥈', color: '#C0C0C0' };
    if (rank === 3) return { emoji: '🥉', color: '#CD7F32' };
    return { emoji: null, color: colors.textSecondary };
  };

  const renderUser = ({ item }) => {
    const isMe = item.id === user?.uid;
    const badge = getBadge(item.points);
    const rankDisplay = getRankDisplay(item.rank);

    return (
      <View style={[
        styles.userCard,
        { backgroundColor: isMe ? colors.primary + '15' : colors.card },
        isMe && { borderWidth: 2, borderColor: colors.primary },
        item.rank <= 3 && { borderWidth: 1.5, borderColor: rankDisplay.color + '60' },
      ]}>
        {/* Rank */}
        <View style={styles.rankBox}>
          {rankDisplay.emoji ? (
            <Text style={{ fontSize: 24 }}>{rankDisplay.emoji}</Text>
          ) : (
            <Text style={[styles.rankNum, { color: colors.textSecondary }]}>
              #{item.rank}
            </Text>
          )}
        </View>

        {/* Avatar */}
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.primary + '30' }]}>
            <Text style={[styles.avatarLetter, { color: colors.primary }]}>
              {item.name?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
              {isMe ? ' (You)' : ''}
            </Text>
            {item.isVerified && <Text style={{ color: '#43D1A6', fontSize: 12 }}>✓</Text>}
          </View>
          <Text style={[styles.userDept, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.department || 'Campus Ink Member'}
          </Text>
          {badge && (
            <Text style={[styles.badgeText, { color: badge.color }]}>
              {badge.badge}
            </Text>
          )}
        </View>

        {/* Points */}
        <View style={styles.pointsBox}>
          <Text style={[styles.pointsValue, { color: colors.primary }]}>
            {(item.points || 0).toLocaleString()}
          </Text>
          <Text style={[styles.pointsLabel, { color: colors.textSecondary }]}>pts</Text>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      {/* Banner */}
      <View style={[styles.banner, { backgroundColor: colors.primary }]}>
        <Text style={styles.bannerTitle}>🏆 Leaderboard</Text>
        <Text style={styles.bannerSub}>Top Campus Ink Contributors</Text>
        {myRank && (
          <View style={styles.myRankPill}>
            <Ionicons name="ribbon" size={16} color="#FFF" />
            <Text style={styles.myRankText}>Your Rank: #{myRank}</Text>
          </View>
        )}
        <View style={styles.myPoints}>
          <Text style={styles.myPointsLabel}>Your Points</Text>
          <Text style={styles.myPointsValue}>{(profile?.points || 0).toLocaleString()}</Text>
        </View>
      </View>

      {/* How to earn */}
      <View style={[styles.earnCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.earnTitle, { color: colors.text }]}>💡 How to Earn Points</Text>
        <View style={styles.earnGrid}>
          {[
            { action: '✍️ Write a post', pts: `+${POINTS.POST_CREATE}` },
            { action: '❤️ Get a like', pts: `+${POINTS.POST_LIKE_RECEIVED}` },
            { action: '💬 Write comment', pts: `+${POINTS.COMMENT_CREATE}` },
            { action: '📅 Daily login', pts: `+${POINTS.DAILY_LOGIN}` },
          ].map((item, i) => (
            <View key={i} style={[styles.earnItem, { backgroundColor: colors.background }]}>
              <Text style={[styles.earnAction, { color: colors.textSecondary }]}>{item.action}</Text>
              <Text style={[styles.earnPts, { color: colors.primary }]}>{item.pts}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Badge Levels */}
      <View style={[styles.badgesCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.badgesTitle, { color: colors.text }]}>🏅 Badge Levels</Text>
        <View style={styles.badgesList}>
          {LEADERBOARD_BADGES.map((b, i) => (
            <View key={i} style={styles.badgeRow}>
              <Text style={[styles.badgeName, { color: b.color }]}>{b.badge}</Text>
              <Text style={[styles.badgeMin, { color: colors.textSecondary }]}>
                {b.min.toLocaleString()}+ pts
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={[styles.listTitle, { color: colors.text }]}>🌟 Top 100 Contributors</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={users}
        keyExtractor={i => i.id}
        renderItem={renderUser}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: {
    alignItems: 'center', paddingTop: 60,
    paddingBottom: 30, paddingHorizontal: 20,
  },
  bannerTitle: { color: '#FFF', fontSize: 28, fontWeight: '800', marginBottom: 4 },
  bannerSub: { color: '#FFFFFF90', fontSize: 14, marginBottom: 16 },
  myRankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF25', paddingHorizontal: 18,
    paddingVertical: 10, borderRadius: 20, marginBottom: 12,
  },
  myRankText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  myPoints: { alignItems: 'center' },
  myPointsLabel: { color: '#FFFFFF80', fontSize: 12 },
  myPointsValue: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  earnCard: { margin: 16, borderRadius: 18, padding: 16 },
  earnTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  earnGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  earnItem: {
    width: '47%', flexDirection: 'row',
    justifyContent: 'space-between', padding: 10,
    borderRadius: 10,
  },
  earnAction: { fontSize: 12 },
  earnPts: { fontSize: 13, fontWeight: '700' },
  badgesCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 18, padding: 16 },
  badgesTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  badgesList: { gap: 8 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeName: { fontSize: 14, fontWeight: '700' },
  badgeMin: { fontSize: 12 },
  listTitle: {
    fontSize: 17, fontWeight: '700',
    paddingHorizontal: 16, marginBottom: 10,
  },
  listContent: { paddingBottom: 100 },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10,
    padding: 14, borderRadius: 18, gap: 12,
  },
  rankBox: { width: 36, alignItems: 'center' },
  rankNum: { fontSize: 14, fontWeight: '700' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 18, fontWeight: '800' },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  userName: { fontSize: 14, fontWeight: '700', flex: 1 },
  userDept: { fontSize: 12, marginBottom: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  pointsBox: { alignItems: 'flex-end' },
  pointsValue: { fontSize: 18, fontWeight: '800' },
  pointsLabel: { fontSize: 11 },
});