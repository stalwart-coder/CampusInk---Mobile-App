// src/screens/Groups/GroupSettingsScreen.js
// Group management: edit info, manage members, approve join requests
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, Image, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  doc, getDoc, updateDoc, deleteDoc, onSnapshot,
  collection, query, where, getDocs, setDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function GroupSettingsScreen({ route, navigation }) {
  const { groupId, isNew } = route.params || {};
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const C = isDark ? DARK : LIGHT;

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [activeTab, setActiveTab] = useState(isNew ? 'info' : 'members');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(doc(db, 'groups', groupId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setGroup(data);
        setEditName(data.name || '');
        setEditDesc(data.description || '');
        setEditPrivate(data.isPrivate || false);
      }
      setLoading(false);
    });
    return unsub;
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    // Members
    const mUnsub = onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    // Join requests
    const rUnsub = onSnapshot(
      query(collection(db, 'groups', groupId, 'joinRequests'), where('status', '==', 'pending')),
      (snap) => { setJoinRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }
    );
    return () => { mUnsub(); rUnsub(); };
  }, [groupId]);

  const saveInfo = async () => {
    if (!editName.trim()) { Alert.alert('', 'Group naam zaruri hai.'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'groups', groupId), {
        name: editName.trim(),
        description: editDesc.trim(),
        isPrivate: editPrivate,
        updatedAt: serverTimestamp(),
      });
      Alert.alert('Saved! ✅', 'Group info update ho gaya.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const approveRequest = async (request) => {
    try {
      // Add as member
      await setDoc(doc(db, 'groups', groupId, 'members', request.userId), {
        userId: request.userId,
        role: 'member',
        joinedAt: serverTimestamp(),
      });
      // Update group member count
      await updateDoc(doc(db, 'groups', groupId), {
        membersCount: (group?.membersCount || 0) + 1,
      });
      // Mark request as approved
      await updateDoc(doc(db, 'groups', groupId, 'joinRequests', request.id), {
        status: 'approved', respondedAt: serverTimestamp(),
      });
      // Notify user
      await addDoc(collection(db, 'notifications'), {
        userId: request.userId,
        type: 'group_approved',
        title: 'Join Request Approved! 🎉',
        body: `Aapki "${group?.name}" group mein join request approve ho gayi!`,
        groupId,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const rejectRequest = async (request) => {
    try {
      await updateDoc(doc(db, 'groups', groupId, 'joinRequests', request.id), {
        status: 'rejected', respondedAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const removeMember = (member) => {
    if (member.userId === user?.uid) { Alert.alert('', 'Aap apne aap ko remove nahi kar sakte.'); return; }
    Alert.alert('Remove Member', `${member.userName || 'User'} ko group se remove karo?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'groups', groupId, 'members', member.id));
        await updateDoc(doc(db, 'groups', groupId), {
          membersCount: Math.max(0, (group?.membersCount || 1) - 1),
        });
      }},
    ]);
  };

  const deleteGroup = () => {
    Alert.alert('Delete Group', `"${group?.name}" permanently delete karna chahte ho?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await updateDoc(doc(db, 'groups', groupId), { deleted: true, deletedAt: serverTimestamp() });
          navigation.goBack();
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (loading) return (
    <View style={[styles.center, { backgroundColor: C.bg }]}>
      <ActivityIndicator color="#6366F1" />
    </View>
  );

  const isOwner = group?.createdBy === user?.uid;
  const TABS = ['info', 'members', ...(group?.isPrivate ? ['requests'] : [])];

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: C.text }]}>{group?.emoji} {group?.name}</Text>
          <Text style={[styles.headerSub, { color: C.subtext }]}>Group Settings</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: C.border }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={styles.tabBtn} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabTxt, { color: activeTab === t ? '#6366F1' : C.subtext }]}>
              {t === 'info' ? 'Info' : t === 'members' ? `Members (${members.length})` : `Requests (${joinRequests.length})`}
            </Text>
            {t === 'requests' && joinRequests.length > 0 && (
              <View style={styles.badge}><Text style={styles.badgeTxt}>{joinRequests.length}</Text></View>
            )}
            {activeTab === t && <View style={styles.tabLine} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* INFO TAB */}
        {activeTab === 'info' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>Basic Info</Text>

            <Text style={[styles.label, { color: C.subtext }]}>Group Naam</Text>
            <TextInput
              style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.inputBg }]}
              value={editName} onChangeText={setEditName} maxLength={50}
              editable={isOwner}
            />

            <Text style={[styles.label, { color: C.subtext }]}>Description</Text>
            <TextInput
              style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.inputBg, height: 80, textAlignVertical: 'top' }]}
              value={editDesc} onChangeText={setEditDesc} multiline maxLength={300}
              editable={isOwner}
            />

            <View style={[styles.toggleRow, { borderColor: C.border }]}>
              <View>
                <Text style={[{ fontSize: 15, fontWeight: '500', color: C.text }]}>Private Group 🔒</Text>
                <Text style={[{ fontSize: 12, color: C.subtext }]}>Join ke liye request required</Text>
              </View>
              <Switch value={editPrivate} onValueChange={setEditPrivate}
                trackColor={{ false: C.border, true: '#6366F1' }} thumbColor="#fff"
                disabled={!isOwner} />
            </View>

            {isOwner && (
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={saveInfo} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> :
                  <Text style={styles.saveBtnTxt}>Save Changes</Text>}
              </TouchableOpacity>
            )}

            {isOwner && (
              <TouchableOpacity style={styles.deleteBtn} onPress={deleteGroup}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
                <Text style={styles.deleteBtnTxt}>Delete Group</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* MEMBERS TAB */}
        {activeTab === 'members' && (
          <View style={styles.section}>
            {members.map(m => (
              <View key={m.id} style={[styles.memberRow, { borderBottomColor: C.border }]}>
                <View style={[styles.avatar, { backgroundColor: '#6366F1' }]}>
                  <Text style={styles.avatarTxt}>
                    {(m.userName || m.userId || 'U')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: C.text }]}>
                    {m.userName || m.userId}
                    {m.userId === user?.uid ? ' (You)' : ''}
                  </Text>
                  <Text style={[styles.memberRole, { color: m.role === 'owner' ? '#6366F1' : C.subtext }]}>
                    {m.role === 'owner' ? '👑 Owner' : m.role === 'admin' ? '⚡ Admin' : 'Member'}
                  </Text>
                </View>
                {isOwner && m.userId !== user?.uid && (
                  <TouchableOpacity onPress={() => removeMember(m)}>
                    <Ionicons name="person-remove-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* REQUESTS TAB */}
        {activeTab === 'requests' && (
          <View style={styles.section}>
            {joinRequests.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
                <Text style={[{ fontSize: 14, color: C.subtext }]}>Koi pending request nahi</Text>
              </View>
            ) : joinRequests.map(r => (
              <View key={r.id} style={[styles.requestCard, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[styles.avatar, { backgroundColor: '#6366F1' }]}>
                  <Text style={styles.avatarTxt}>{(r.userName || 'U')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { color: C.text }]}>{r.userName || 'User'}</Text>
                  <Text style={[{ fontSize: 12, color: C.subtext }]}>Join karna chahta/chahti hai</Text>
                </View>
                <View style={styles.reqBtns}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => approveRequest(r)}>
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectRequest(r)}>
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const DARK = { bg: '#0a0a0f', card: '#111827', border: '#1f2937', text: '#F9FAFB', subtext: '#9CA3AF', inputBg: '#1f2937' };
const LIGHT = { bg: '#F9FAFB', card: '#fff', border: '#E5E7EB', text: '#111827', subtext: '#6B7280', inputBg: '#fff' };

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSub: { fontSize: 12 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 20 },
  tabTxt: { fontSize: 14, fontWeight: '500' },
  tabLine: { height: 2, backgroundColor: '#6366F1', borderRadius: 1, marginTop: 2 },
  badge: { position: 'absolute', top: 8, right: -8, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  badgeTxt: { fontSize: 10, color: '#fff', fontWeight: '700' },
  section: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  saveBtn: { backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  saveBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#EF4444' },
  deleteBtnTxt: { fontSize: 14, color: '#EF4444', fontWeight: '500' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  memberName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  memberRole: { fontSize: 12 },
  requestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  reqBtns: { flexDirection: 'row', gap: 8 },
  approveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 40 },
});
