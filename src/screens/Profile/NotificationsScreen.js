// src/screens/Profile/NotificationsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, onSnapshot,
  updateDoc, doc, where, writeBatch, getDocs,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import moment from 'moment';

const NOTIF_CONFIG = {
  like: { icon: 'heart', color: '#FF4757', bg: '#FF475715' },
  comment: { icon: 'chatbubble', color: '#6C63FF', bg: '#6C63FF15' },
  follow: { icon: 'person-add', color: '#43D1A6', bg: '#43D1A615' },
  event: { icon: 'calendar', color: '#FFA502', bg: '#FFA50215' },
  system: { icon: 'notifications', color: '#6C63FF', bg: '#6C63FF15' },
};

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const markRead = async (id) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  };

  const markAllRead = async () => {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const handlePress = (notif) => {
    markRead(notif.id);
    if ((notif.type === 'like' || notif.type === 'comment') && notif.postId) {
      navigation.navigate('PostDetail', { postId: notif.postId });
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderNotif = ({ item }) => {
    const config = NOTIF_CONFIG[item.type] || NOTIF_CONFIG.system;
    return (
      <TouchableOpacity
        style={[
          styles.notifCard,
          {
            backgroundColor: item.read ? colors.card : colors.primary + '08',
            borderLeftColor: item.read ? 'transparent' : colors.primary,
          }
        ]}
        onPress={() => handlePress(item)}
        activeOpacity={0.8}
      >
        {/* From User Photo or Icon */}
        {item.fromUserPhoto ? (
          <View style={styles.avatarWrapper}>
            <Image source={{ uri: item.fromUserPhoto }} style={styles.avatar} />
            <View style={[styles.iconOverlay, { backgroundColor: config.color }]}>
              <Ionicons name={config.icon} size={10} color="#FFF" />
            </View>
          </View>
        ) : (
          <View style={[styles.iconBox, { backgroundColor: config.bg }]}>
            <Ionicons name={config.icon} size={22} color={config.color} />
          </View>
        )}

        <View style={styles.notifContent}>
          <Text style={[styles.notifTitle, { color: colors.text }]}>
            {item.title}
          </Text>
          {item.body ? (
            <Text style={[styles.notifBody, { color: colors.textSecondary }]} numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}
          <Text style={[styles.notifTime, { color: colors.textSecondary }]}>
            {moment(item.createdAt?.toDate()).fromNow()}
          </Text>
        </View>

        {!item.read && (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: colors.primary + '15' }]}
            onPress={markAllRead}
          >
            <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Unread Banner */}
      {unreadCount > 0 && (
        <View style={[styles.unreadBanner, { backgroundColor: colors.primary + '12' }]}>
          <Ionicons name="notifications" size={14} color={colors.primary} />
          <Text style={[styles.unreadText, { color: colors.primary }]}>
            {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={i => i.id}
          renderItem={renderNotif}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>🔔</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up!</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Notifications will appear here when someone likes or comments on your posts
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingTop: 58,
    paddingBottom: 14, gap: 12,
  },
  backBtn: { padding: 4 },
  pageTitle: { flex: 1, fontSize: 24, fontWeight: '800' },
  markAllBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  markAllText: { fontSize: 12, fontWeight: '600' },
  unreadBanner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginHorizontal: 18, marginBottom: 8,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
  },
  unreadText: { fontSize: 13, fontWeight: '600' },
  listContent: { padding: 16, gap: 10, paddingBottom: 100 },
  notifCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, borderRadius: 16,
    borderLeftWidth: 3, gap: 12,
  },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  iconOverlay: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  iconBox: {
    width: 46, height: 46, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  notifBody: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  notifTime: { fontSize: 11 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, marginTop: 6,
  },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
