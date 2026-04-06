// src/screens/Groups/GroupsScreen.js
// Complete overhaul: public/private groups, join requests, member management
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator,
  Switch, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, updateDoc, deleteDoc,
  where, getDocs, getDoc, setDoc, increment,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import moment from 'moment';

const GROUP_EMOJIS = ['🎓','💻','🎨','🏆','🔬','📚','🎭','⚽','🎵','🏫','🌍','🚀'];
const JOIN_STATUS = { MEMBER: 'member', PENDING: 'pending', NONE: 'none' };

export default function GroupsScreen({ navigation }) {
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const C = isDark ? DARK : LIGHT;

  const [groups, setGroups] = useState([]);
  const [joinStatuses, setJoinStatuses] = useState({});
  const [tab, setTab] = useState('discover');
  const [createModal, setCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🎓');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGroups(list);
      setLoading(false);
      if (user) loadStatuses(list);
    });
    return unsub;
  }, [user]);

  const loadStatuses = async (list) => {
    if (!user) return;
    const statuses = {};
    await Promise.all(list.map(async (g) => {
      try {
        const mSnap = await getDoc(doc(db, 'groups', g.id, 'members', user.uid));
        if (mSnap.exists()) { statuses[g.id] = JOIN_STATUS.MEMBER; return; }
        const rSnap = await getDocs(query(
          collection(db, 'groups', g.id, 'joinRequests'),
          where('userId', '==', user.uid), where('status', '==', 'pending')
        ));
        statuses[g.id] = rSnap.empty ? JOIN_STATUS.NONE : JOIN_STATUS.PENDING;
      } catch { statuses[g.id] = JOIN_STATUS.NONE; }
    }));
    setJoinStatuses(statuses);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStatuses(groups);
    setRefreshing(false);
  }, [groups]);

  const handleJoin = async (group) => {
    if (!user) return;
    const status = joinStatuses[group.id] || JOIN_STATUS.NONE;

    if (status === JOIN_STATUS.MEMBER) {
      Alert.alert('Leave Group', `"${group.name}" chhod doge?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: async () => {
          await deleteDoc(doc(db, 'groups', group.id, 'members', user.uid));
          await updateDoc(doc(db, 'groups', group.id), { membersCount: increment(-1) });
          setJoinStatuses(p => ({ ...p, [group.id]: JOIN_STATUS.NONE }));
        }},
      ]);
      return;
    }

    if (status === JOIN_STATUS.PENDING) {
      Alert.alert('Request Pending', 'Aapki join request review ho rahi hai.');
      return;
    }

    if (group.isPrivate) {
      await addDoc(collection(db, 'groups', group.id, 'joinRequests'), {
        userId: user.uid,
        userName: profile?.displayName || 'User',
        userPhoto: profile?.photoURL || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setJoinStatuses(p => ({ ...p, [group.id]: JOIN_STATUS.PENDING }));
      Alert.alert('Request Sent! ✅', 'Admin review karenge.');
    } else {
      await setDoc(doc(db, 'groups', group.id, 'members', user.uid), {
        userId: user.uid, role: 'member', joinedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'groups', group.id), { membersCount: increment(1) });
      setJoinStatuses(p => ({ ...p, [group.id]: JOIN_STATUS.MEMBER }));
    }
  };

  const createGroup = async () => {
    if (!groupName.trim()) { Alert.alert('', 'Group naam dalo.'); return; }
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, 'groups'), {
        name: groupName.trim(), description: groupDesc.trim(),
        emoji: selectedEmoji, isPrivate,
        createdBy: user.uid, creatorName: profile?.displayName || 'User',
        membersCount: 1, postsCount: 0, createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'groups', ref.id, 'members', user.uid), {
        userId: user.uid, role: 'owner', joinedAt: serverTimestamp(),
      });
      setJoinStatuses(p => ({ ...p, [ref.id]: JOIN_STATUS.MEMBER }));
      setGroupName(''); setGroupDesc(''); setSelectedEmoji('🎓');
      setIsPrivate(false); setCreateModal(false);
      navigation.navigate('GroupSettings', { groupId: ref.id, isNew: true });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setCreating(false); }
  };

  const memberIds = Object.entries(joinStatuses).filter(([,s]) => s === JOIN_STATUS.MEMBER).map(([id]) => id);
  const displayGroups = groups
    .filter(g => tab === 'mygroups' ? memberIds.includes(g.id) : !memberIds.includes(g.id))
    .filter(g => !searchQuery ||
      g.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description?.toLowerCase().includes(searchQuery.toLowerCase()));

  const renderGroup = ({ item: g }) => {
    const status = joinStatuses[g.id] || JOIN_STATUS.NONE;
    const isMember = status === JOIN_STATUS.MEMBER;
    const isPending = status === JOIN_STATUS.PENDING;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: C.card, borderColor: C.border }]}
        onPress={() => isMember && navigation.navigate('GroupChat', { groupId: g.id, groupName: g.name })}
        activeOpacity={isMember ? 0.7 : 1}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.emojiBox, { backgroundColor: C.emojiBox }]}>
            <Text style={styles.emoji}>{g.emoji || '🎓'}</Text>
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardName, { color: C.text }]} numberOfLines={1}>{g.name}</Text>
              {g.isPrivate && (
                <View style={[styles.badge, { backgroundColor: C.privateBg }]}>
                  <Ionicons name="lock-closed" size={9} color={C.privateTxt} />
                  <Text style={[styles.badgeTxt, { color: C.privateTxt }]}>Private</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardDesc, { color: C.subtext }]} numberOfLines={2}>{g.description || 'No description'}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="people" size={12} color={C.subtext} />
              <Text style={[styles.metaTxt, { color: C.subtext }]}>{g.membersCount || 0} members · {moment(g.createdAt?.toDate?.()).fromNow()}</Text>
            </View>
          </View>
        </View>

        {isMember ? (
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.chatBtn}
              onPress={() => navigation.navigate('GroupChat', { groupId: g.id, groupName: g.name })}>
              <Ionicons name="chatbubbles" size={13} color="#fff" />
              <Text style={styles.chatBtnTxt}>Open Chat</Text>
            </TouchableOpacity>
            {g.createdBy === user?.uid && (
              <TouchableOpacity style={[styles.settingsBtn, { backgroundColor: C.settingsBg }]}
                onPress={() => navigation.navigate('GroupSettings', { groupId: g.id })}>
                <Ionicons name="settings-outline" size={14} color={C.subtext} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.leaveBtn} onPress={() => handleJoin(g)}>
              <Text style={styles.leaveTxt}>Leave</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.joinBtn, {
              backgroundColor: isPending ? C.pendingBg : g.isPrivate ? '#374151' : '#6366F1'
            }]}
            onPress={() => handleJoin(g)}
          >
            <Ionicons name={isPending ? 'time-outline' : g.isPrivate ? 'mail-outline' : 'add'} size={14}
              color={isPending ? C.pendingTxt : '#fff'} />
            <Text style={[styles.joinBtnTxt, isPending && { color: C.pendingTxt }]}>
              {isPending ? 'Request Pending' : g.isPrivate ? 'Request to Join' : 'Join Group'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <LinearGradient colors={isDark ? ['#111827','#0d1117'] : ['#f0f4ff','#f5f0ff']} style={styles.header}>
        <Text style={[styles.headerTitle, { color: C.text }]}>Groups</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <View style={[styles.searchRow, { backgroundColor: C.card, borderColor: C.border }]}>
        <Ionicons name="search" size={15} color={C.subtext} />
        <TextInput style={[styles.searchInput, { color: C.text }]}
          placeholder="Groups dhundo..." placeholderTextColor={C.subtext}
          value={searchQuery} onChangeText={setSearchQuery} />
        {!!searchQuery && <TouchableOpacity onPress={() => setSearchQuery('')}>
          <Ionicons name="close-circle" size={15} color={C.subtext} />
        </TouchableOpacity>}
      </View>

      <View style={[styles.tabRow, { borderBottomColor: C.border }]}>
        {[['discover','Discover'], ['mygroups',`My Groups (${memberIds.length})`]].map(([t,label]) => (
          <TouchableOpacity key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
            <Text style={[styles.tabTxt, { color: tab === t ? '#6366F1' : C.subtext }]}>{label}</Text>
            {tab === t && <View style={styles.tabLine} />}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList data={displayGroups} keyExtractor={i => i.id} renderItem={renderGroup}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>{tab === 'mygroups' ? '😶' : '🔍'}</Text>
              <Text style={[styles.emptyTxt, { color: C.subtext }]}>
                {tab === 'mygroups' ? 'Kisi group mein nahi ho.\nDiscover mein join karo!' : 'Koi group nahi mila.'}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={createModal} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>New Group Banao</Text>
              <TouchableOpacity onPress={() => setCreateModal(false)}>
                <Ionicons name="close" size={24} color={C.subtext} />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {GROUP_EMOJIS.map(e => (
                <TouchableOpacity key={e}
                  style={[styles.emojiPick, selectedEmoji === e && styles.emojiPickSel]}
                  onPress={() => setSelectedEmoji(e)}>
                  <Text style={{ fontSize: 22 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.inputBg }]}
              placeholder="Group naam *" placeholderTextColor={C.subtext}
              value={groupName} onChangeText={setGroupName} maxLength={50} />

            <TextInput style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.inputBg, height: 72, textAlignVertical: 'top' }]}
              placeholder="Description (optional)" placeholderTextColor={C.subtext}
              value={groupDesc} onChangeText={setGroupDesc} multiline maxLength={200} />

            <View style={[styles.toggleRow, { borderColor: C.border }]}>
              <View>
                <Text style={[{ fontSize: 15, fontWeight: '500', color: C.text }]}>Private Group 🔒</Text>
                <Text style={[{ fontSize: 12, color: C.subtext }]}>Join ke liye request bhejni padegi</Text>
              </View>
              <Switch value={isPrivate} onValueChange={setIsPrivate}
                trackColor={{ false: C.border, true: '#6366F1' }} thumbColor="#fff" />
            </View>

            <TouchableOpacity style={[styles.createBtn, creating && { opacity: 0.6 }]}
              onPress={createGroup} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> :
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Create Group</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const DARK = {
  bg: '#0a0a0f', card: '#111827', border: '#1f2937', text: '#F9FAFB',
  subtext: '#9CA3AF', emojiBox: '#1f2937', inputBg: '#1f2937',
  privateBg: 'rgba(239,68,68,0.15)', privateTxt: '#F87171',
  settingsBg: '#1f2937', pendingBg: 'rgba(245,158,11,0.15)', pendingTxt: '#FBBF24',
};
const LIGHT = {
  bg: '#F9FAFB', card: '#fff', border: '#E5E7EB', text: '#111827',
  subtext: '#6B7280', emojiBox: '#F3F4F6', inputBg: '#F9FAFB',
  privateBg: 'rgba(239,68,68,0.08)', privateTxt: '#DC2626',
  settingsBg: '#F3F4F6', pendingBg: 'rgba(245,158,11,0.1)', pendingTxt: '#D97706',
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14 },
  tabRow: {
    flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1,
  },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 20 },
  tabTxt: { fontSize: 14, fontWeight: '500' },
  tabLine: { height: 2, backgroundColor: '#6366F1', borderRadius: 1, marginTop: 2 },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  emojiBox: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  cardName: { fontSize: 15, fontWeight: '600', flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '500' },
  cardDesc: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 12 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, backgroundColor: '#6366F1', borderRadius: 10, paddingVertical: 8,
  },
  chatBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '500' },
  settingsBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  leaveBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  leaveTxt: { fontSize: 12, color: '#EF4444' },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 12,
  },
  joinBtnTxt: { fontSize: 13, fontWeight: '600', color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTxt: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  emojiPick: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: 'rgba(99,102,241,0.08)' },
  emojiPickSel: { backgroundColor: 'rgba(99,102,241,0.25)', borderWidth: 1.5, borderColor: '#6366F1' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  createBtn: { backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
});
