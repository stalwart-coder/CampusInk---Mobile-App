// src/screens/Admin/AdminScreen.js - Fixed with Ads tab
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, getCountFromServer } from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import moment from 'moment';

export default function AdminScreen({ navigation }) {
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({ users: 0, posts: 0, groups: 0, reports: 0, ads: 0 });
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    fetchStats();
    const u1 = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc')), s => setPosts(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')), s => setReports(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u4 = onSnapshot(query(collection(db, 'ads'), orderBy('createdAt', 'desc')), s => setAds(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); u4(); };
  }, [isAdmin]);

  const fetchStats = async () => {
    try {
      const [u, p, g, r, a] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'posts')),
        getCountFromServer(collection(db, 'groups')),
        getCountFromServer(collection(db, 'reports')),
        getCountFromServer(collection(db, 'ads')),
      ]);
      setStats({ users: u.data().count, posts: p.data().count, groups: g.data().count, reports: r.data().count, ads: a.data().count });
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ fontSize: 48 }}>🚫</Text>
        <Text style={[{ color: colors.text, fontSize: 18, fontWeight: '700' }]}>Admin Access Only</Text>
      </View>
    );
  }

  const filteredUsers = searchUser ? users.filter(u => u.name?.toLowerCase().includes(searchUser.toLowerCase()) || u.email?.toLowerCase().includes(searchUser.toLowerCase())) : users;

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'posts', label: `📝 Posts (${posts.length})` },
    { id: 'users', label: `👥 Users (${users.length})` },
    { id: 'reports', label: `🚩 Reports${reports.length > 0 ? ` (${reports.length})` : ''}` },
    { id: 'ads', label: `📢 Ads (${ads.length})` },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={22} color="#FFF" /></TouchableOpacity>
        <Text style={styles.headerTitle}>🛡️ Admin Dashboard</Text>
        <TouchableOpacity onPress={fetchStats}><Ionicons name="refresh" size={20} color="#FFF" /></TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={[styles.tab, activeTab === t.id && { borderBottomWidth: 2, borderBottomColor: colors.primary }]} onPress={() => setActiveTab(t.id)}>
            <Text style={[styles.tabText, { color: activeTab === t.id ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <View style={styles.section}>
            {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
              <>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Users', value: stats.users, icon: '👥', color: '#6366F1' },
                    { label: 'Posts', value: stats.posts, icon: '📝', color: '#10B981' },
                    { label: 'Groups', value: stats.groups, icon: '💬', color: '#EC4899' },
                    { label: 'Reports', value: stats.reports, icon: '🚩', color: '#EF4444' },
                    { label: 'Active Ads', value: ads.filter(a => a.status === 'active').length, icon: '📢', color: '#F59E0B' },
                    { label: 'Total Ads', value: stats.ads, icon: '🎯', color: '#8B5CF6' },
                  ].map((s, i) => (
                    <View key={i} style={[styles.statCard, { backgroundColor: s.color + '15', borderColor: s.color + '40' }]}>
                      <Text style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</Text>
                      <Text style={[{ fontSize: 22, fontWeight: '800', color: s.color }]}>{s.value}</Text>
                      <Text style={[{ fontSize: 11, color: colors.textSecondary }]}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={[styles.manageAdsBtn, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]} onPress={() => navigation.navigate('AdsManager')}>
                  <Ionicons name="megaphone" size={22} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 15, fontWeight: '700', color: '#F59E0B' }]}>Manage Advertisements</Text>
                    <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>Create, edit and track ads</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#F59E0B" />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* POSTS */}
        {activeTab === 'posts' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>All Posts ({posts.length})</Text>
            {posts.map(p => (
              <View key={p.id} style={[styles.postRow, { backgroundColor: colors.card }]}>
                <View style={[styles.postThumb, { backgroundColor: colors.primary + '20', alignItems: 'center', justifyContent: 'center' }]}>
                  {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={styles.postThumb} /> : <Text style={{ fontSize: 18 }}>📝</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text }]} numberOfLines={1}>{p.title}</Text>
                  <Text style={[{ fontSize: 11, color: colors.textSecondary }]}>{p.authorName} · {moment(p.createdAt?.toDate()).fromNow()}</Text>
                  <Text style={[{ fontSize: 11, color: colors.textSecondary }]}>❤️ {p.likesCount || 0}  💬 {p.commentsCount || 0}</Text>
                </View>
                <TouchableOpacity style={{ padding: 8, backgroundColor: '#EF444415', borderRadius: 8 }} onPress={() => Alert.alert('Delete Post', `Delete "${p.title}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'posts', p.id)) }])}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* USERS */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput style={[{ flex: 1, fontSize: 14, color: colors.text }]} placeholder="Search users..." placeholderTextColor={colors.textSecondary} value={searchUser} onChangeText={setSearchUser} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>All Users ({filteredUsers.length})</Text>
            {filteredUsers.map(u => (
              <View key={u.id} style={[styles.userRow, { backgroundColor: colors.card }]}>
                {u.photoURL ? <Image source={{ uri: u.photoURL }} style={styles.userAvatar} /> : <View style={[styles.userAvatar, { backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>{(u.name || u.displayName || '?')[0]}</Text></View>}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text }]}>{u.name || u.displayName}</Text>
                    {u.isAdmin && <Text style={{ color: '#6366F1', fontSize: 11 }}>🛡️</Text>}
                    {u.isVerified && <Text style={{ color: '#10B981', fontSize: 11 }}>✓</Text>}
                    {u.isBanned && <Text style={{ color: '#EF4444', fontSize: 11 }}>🚫</Text>}
                  </View>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>{u.email}</Text>
                  <Text style={[{ fontSize: 11, color: colors.textSecondary }]}>⭐ {u.points || 0} · 📝 {u.postsCount || 0} posts</Text>
                </View>
                {!u.isAdmin && (
                  <View style={{ gap: 5 }}>
                    <TouchableOpacity style={[styles.actionChip, { backgroundColor: u.isVerified ? '#10B98120' : '#6366F120' }]} onPress={() => { updateDoc(doc(db, 'users', u.id), { isVerified: !u.isVerified }); }}>
                      <Text style={{ fontSize: 11, color: u.isVerified ? '#10B981' : '#6366F1', fontWeight: '700' }}>{u.isVerified ? 'Unverify' : 'Verify'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionChip, { backgroundColor: u.isBanned ? '#10B98120' : '#EF444420' }]} onPress={() => Alert.alert(u.isBanned ? 'Unban' : 'Ban', `${u.isBanned ? 'Unban' : 'Ban'} ${u.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', onPress: () => updateDoc(doc(db, 'users', u.id), { isBanned: !u.isBanned }) }])}>
                      <Text style={{ fontSize: 11, color: u.isBanned ? '#10B981' : '#EF4444', fontWeight: '700' }}>{u.isBanned ? 'Unban' : 'Ban'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* REPORTS */}
        {activeTab === 'reports' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Reports ({reports.length})</Text>
            {reports.length === 0
              ? <View style={{ alignItems: 'center', paddingTop: 50 }}><Text style={{ fontSize: 40 }}>✅</Text><Text style={{ color: colors.textSecondary, marginTop: 8 }}>No reports!</Text></View>
              : reports.map(r => (
                <View key={r.id} style={[styles.reportCard, { backgroundColor: colors.card, borderLeftColor: '#EF4444' }]}>
                  <Text style={[{ fontSize: 13, fontWeight: '700', color: '#EF4444', marginBottom: 4 }]}>🚩 {r.reason}</Text>
                  <Text style={[{ fontSize: 12, color: colors.text, marginBottom: 8 }]} numberOfLines={1}>Post: {r.postTitle}</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[styles.reportBtn, { backgroundColor: '#10B98120' }]} onPress={() => deleteDoc(doc(db, 'reports', r.id))}>
                      <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 12 }}>✓ Resolve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.reportBtn, { backgroundColor: '#EF444420' }]} onPress={() => { deleteDoc(doc(db, 'posts', r.postId)); deleteDoc(doc(db, 'reports', r.id)); }}>
                      <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 12 }}>🗑 Delete Post</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {/* ADS */}
        {activeTab === 'ads' && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Ads ({ads.length})</Text>
              <TouchableOpacity style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 }]} onPress={() => navigation.navigate('AdsManager')}>
                <Ionicons name="add" size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>Manage Ads</Text>
              </TouchableOpacity>
            </View>
            {ads.length === 0
              ? (
                <View style={{ alignItems: 'center', paddingTop: 50, gap: 10 }}>
                  <Text style={{ fontSize: 48 }}>📢</Text>
                  <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.text }]}>No Ads Yet</Text>
                  <Text style={[{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }]}>Create ads to generate revenue from the app</Text>
                  <TouchableOpacity style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 8 }]} onPress={() => navigation.navigate('AdsManager')}>
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>Create First Ad</Text>
                  </TouchableOpacity>
                </View>
              )
              : ads.map(ad => (
                <View key={ad.id} style={[styles.adCard, { backgroundColor: colors.card, borderColor: ad.status === 'active' ? '#10B98130' : colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text }]}>{ad.title}</Text>
                    <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: ad.status === 'active' ? '#10B98115' : '#F59E0B15' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: ad.status === 'active' ? '#10B981' : '#F59E0B' }}>{ad.status === 'active' ? '● Active' : '● Paused'}</Text>
                    </View>
                  </View>
                  {ad.mediaUrl ? <Image source={{ uri: ad.mediaUrl }} style={[{ width: '100%', height: 120, borderRadius: 10, marginBottom: 8 }]} resizeMode="cover" /> : null}
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 10 }]}>👁 {ad.impressions || 0} impressions · 👆 {ad.clicks || 0} clicks · {ad.type || 'banner'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: ad.status === 'active' ? '#F59E0B15' : '#10B98115' }]} onPress={() => updateDoc(doc(db, 'ads', ad.id), { status: ad.status === 'active' ? 'paused' : 'active' })}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: ad.status === 'active' ? '#F59E0B' : '#10B981' }}>{ad.status === 'active' ? 'Pause' : 'Activate'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#EF444415' }]} onPress={() => Alert.alert('Delete', `Delete "${ad.title}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteDoc(doc(db, 'ads', ad.id)) }])}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            }
          </View>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  tabBar: { borderBottomWidth: 1 },
  tab: { paddingHorizontal: 14, paddingVertical: 14 },
  tabText: { fontSize: 13, fontWeight: '600' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { width: '47%', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  manageAdsBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, gap: 8 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, marginBottom: 8 },
  postThumb: { width: 50, height: 50, borderRadius: 10 },
  userRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 14, marginBottom: 8, gap: 10 },
  userAvatar: { width: 42, height: 42, borderRadius: 21 },
  actionChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  reportCard: { padding: 14, borderRadius: 12, marginBottom: 10, borderLeftWidth: 3 },
  reportBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  adCard: { borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1 },
});