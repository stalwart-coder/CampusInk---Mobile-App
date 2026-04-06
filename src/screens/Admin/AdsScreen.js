// src/screens/Admin/AdsScreen.js
// Advertisement management: banner, video, sponsored posts, story ads
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, Image, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import * as ImagePicker from 'expo-image-picker';
import { uploadToCloudinary } from '../../services/cloudinary';
import moment from 'moment';

const AD_TYPES = [
  { key: 'banner', label: 'Banner Ad', icon: 'image', desc: 'Feed mein image banner' },
  { key: 'video', label: 'Video Ad', icon: 'videocam', desc: 'Auto-play video ad' },
  { key: 'sponsored', label: 'Sponsored Post', icon: 'megaphone', desc: 'Native post jaise dikhta hai' },
  { key: 'story', label: 'Story Ad', icon: 'play-circle', desc: 'Stories mein full-screen ad' },
];

const STATUS_COLORS = {
  active: { bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  paused: { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' },
  draft: { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' },
  completed: { bg: 'rgba(99,102,241,0.15)', text: '#6366F1' },
};

export default function AdsScreen({ navigation }) {
  const { isDark } = useTheme();
  const { user, isAdmin } = useAuth();
  const C = isDark ? DARK : LIGHT;

  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState('all');
  const [uploading, setUploading] = useState(false);

  // Create ad form
  const [adType, setAdType] = useState('banner');
  const [adTitle, setAdTitle] = useState('');
  const [adBody, setAdBody] = useState('');
  const [adCTA, setAdCTA] = useState('');
  const [adLink, setAdLink] = useState('');
  const [adMedia, setAdMedia] = useState(null);
  const [adMediaType, setAdMediaType] = useState(null);
  const [targetCollege, setTargetCollege] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'ads'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setAds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const pickAdMedia = async () => {
    const isVideo = adType === 'video' || adType === 'story';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isVideo ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAdMedia(result.assets[0]);
      setAdMediaType(isVideo ? 'video' : 'image');
    }
  };

  const createAd = async () => {
    if (!adTitle.trim()) { Alert.alert('', 'Ad title dalo.'); return; }
    setUploading(true);
    try {
      let mediaUrl = null;
      if (adMedia) {
        const res = await uploadToCloudinary(adMedia.uri, adMediaType);
        mediaUrl = res.url;
      }

      await addDoc(collection(db, 'ads'), {
        type: adType,
        title: adTitle.trim(),
        body: adBody.trim(),
        ctaText: adCTA.trim() || 'Learn More',
        ctaLink: adLink.trim(),
        mediaUrl,
        targetCollege: targetCollege.trim() || null,
        status: 'draft',
        impressions: 0,
        clicks: 0,
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
      });

      setAdTitle(''); setAdBody(''); setAdCTA(''); setAdLink('');
      setAdMedia(null); setTargetCollege(''); setAdType('banner');
      setCreateModal(false);
      Alert.alert('Ad Created! ✅', 'Draft mein save ho gaya. Activate karo jab ready ho.');
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally { setUploading(false); }
  };

  const toggleAdStatus = async (ad) => {
    const newStatus = ad.status === 'active' ? 'paused' : 'active';
    try {
      await updateDoc(doc(db, 'ads', ad.id), { status: newStatus, updatedAt: serverTimestamp() });
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const deleteAd = (ad) => {
    Alert.alert('Delete Ad', `"${ad.title}" delete karna chahte ho?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'ads', ad.id));
      }},
    ]);
  };

  const filteredAds = selectedTab === 'all' ? ads : ads.filter(a => a.status === selectedTab);

  // ─── Summary stats ────────────────────────────────────────────────────────
  const totalImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
  const activeCount = ads.filter(a => a.status === 'active').length;
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : '0';

  const renderAd = ({ item: ad }) => {
    const sc = STATUS_COLORS[ad.status] || STATUS_COLORS.draft;
    const typeInfo = AD_TYPES.find(t => t.key === ad.type);
    const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0';

    return (
      <View style={[styles.adCard, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={styles.adCardHeader}>
          <View style={[styles.adTypeBadge, { backgroundColor: 'rgba(99,102,241,0.12)' }]}>
            <Ionicons name={typeInfo?.icon || 'megaphone'} size={14} color="#6366F1" />
            <Text style={styles.adTypeTxt}>{typeInfo?.label || ad.type}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusTxt, { color: sc.text }]}>{ad.status}</Text>
          </View>
        </View>

        {ad.mediaUrl && (
          <Image source={{ uri: ad.mediaUrl }} style={styles.adMedia} resizeMode="cover" />
        )}

        <Text style={[styles.adTitle, { color: C.text }]}>{ad.title}</Text>
        {ad.body ? <Text style={[styles.adBody, { color: C.subtext }]} numberOfLines={2}>{ad.body}</Text> : null}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: C.text }]}>{ad.impressions?.toLocaleString() || 0}</Text>
            <Text style={[styles.statLabel, { color: C.subtext }]}>Impressions</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: C.text }]}>{ad.clicks?.toLocaleString() || 0}</Text>
            <Text style={[styles.statLabel, { color: C.subtext }]}>Clicks</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: '#6366F1' }]}>{ctr}%</Text>
            <Text style={[styles.statLabel, { color: C.subtext }]}>CTR</Text>
          </View>
        </View>

        <Text style={[styles.adDate, { color: C.subtext }]}>
          {moment(ad.createdAt?.toDate?.()).fromNow()} · {ad.targetCollege || 'All colleges'}
        </Text>

        {/* Actions */}
        <View style={styles.adActions}>
          <TouchableOpacity
            style={[styles.adActionBtn, {
              backgroundColor: ad.status === 'active' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'
            }]}
            onPress={() => toggleAdStatus(ad)}
          >
            <Ionicons name={ad.status === 'active' ? 'pause' : 'play'} size={14}
              color={ad.status === 'active' ? '#F59E0B' : '#10B981'} />
            <Text style={[styles.adActionTxt, { color: ad.status === 'active' ? '#F59E0B' : '#10B981' }]}>
              {ad.status === 'active' ? 'Pause' : 'Activate'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.adActionBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}
            onPress={() => deleteAd(ad)}>
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
            <Text style={[styles.adActionTxt, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]}>Advertisements</Text>
        <TouchableOpacity onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={24} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        {[
          { label: 'Active Ads', value: activeCount, color: '#10B981' },
          { label: 'Impressions', value: totalImpressions.toLocaleString(), color: '#6366F1' },
          { label: 'Total Clicks', value: totalClicks.toLocaleString(), color: '#F59E0B' },
          { label: 'Avg CTR', value: avgCTR + '%', color: '#EC4899' },
        ].map(s => (
          <View key={s.label} style={[styles.statCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[styles.statCardNum, { color: s.color }]}>{s.value}</Text>
            <Text style={[styles.statCardLabel, { color: C.subtext }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScrollView}>
        {['all', 'active', 'paused', 'draft'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.filterTab, selectedTab === t && styles.filterTabActive]}
            onPress={() => setSelectedTab(t)}
          >
            <Text style={[styles.filterTabTxt, { color: selectedTab === t ? '#6366F1' : C.subtext }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)} ({t === 'all' ? ads.length : ads.filter(a => a.status === t).length})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#6366F1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredAds}
          keyExtractor={i => i.id}
          renderItem={renderAd}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📢</Text>
              <Text style={[{ fontSize: 14, color: C.subtext }]}>Koi ads nahi. Pehla ad banao!</Text>
            </View>
          }
        />
      )}

      {/* Create Ad Modal */}
      <Modal visible={createModal} animationType="slide">
        <View style={[styles.modalContainer, { backgroundColor: C.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => { setCreateModal(false); setAdMedia(null); }}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: C.text }]}>New Advertisement</Text>
            <TouchableOpacity onPress={createAd} disabled={uploading}>
              {uploading ? <ActivityIndicator color="#6366F1" size="small" /> :
                <Text style={{ color: '#6366F1', fontWeight: '700', fontSize: 16 }}>Create</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.formLabel, { color: C.subtext }]}>Ad Type</Text>
            <View style={styles.adTypeGrid}>
              {AD_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.adTypeCard, { backgroundColor: C.card, borderColor: adType === t.key ? '#6366F1' : C.border }]}
                  onPress={() => { setAdType(t.key); setAdMedia(null); }}
                >
                  <Ionicons name={t.icon} size={22} color={adType === t.key ? '#6366F1' : C.subtext} />
                  <Text style={[styles.adTypeLabel, { color: adType === t.key ? '#6366F1' : C.text }]}>{t.label}</Text>
                  <Text style={[styles.adTypeDesc, { color: C.subtext }]}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Media upload */}
            <TouchableOpacity
              style={[styles.mediaUploadBtn, { borderColor: C.border, backgroundColor: C.card }]}
              onPress={pickAdMedia}
            >
              {adMedia ? (
                adMediaType === 'image' ? (
                  <Image source={{ uri: adMedia.uri }} style={{ width: '100%', height: 160, borderRadius: 10 }} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <Ionicons name="videocam" size={32} color="#6366F1" />
                    <Text style={{ color: C.subtext, marginTop: 4 }}>Video selected</Text>
                  </View>
                )
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="cloud-upload-outline" size={32} color={C.subtext} />
                  <Text style={[{ color: C.subtext, marginTop: 8, fontSize: 14 }]}>
                    {adType === 'video' ? 'Video upload karo' : 'Image upload karo'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {[
              ['Ad Title *', adTitle, setAdTitle, 80],
              ['Ad Body/Description', adBody, setAdBody, 200, true],
              ['CTA Button Text (e.g., Apply Now)', adCTA, setAdCTA, 30],
              ['CTA Link / URL', adLink, setAdLink, 200],
              ['Target College (blank = all)', targetCollege, setTargetCollege, 100],
            ].map(([label, val, setter, maxLen, multi]) => (
              <View key={label}>
                <Text style={[styles.formLabel, { color: C.subtext }]}>{label}</Text>
                <TextInput
                  style={[styles.formInput, {
                    color: C.text, borderColor: C.border, backgroundColor: C.inputBg,
                    ...(multi && { height: 72, textAlignVertical: 'top' }),
                  }]}
                  value={val} onChangeText={setter}
                  maxLength={maxLen} multiline={!!multi}
                  placeholderTextColor={C.subtext}
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const DARK = { bg: '#0a0a0f', card: '#111827', border: '#1f2937', text: '#F9FAFB', subtext: '#9CA3AF', inputBg: '#1f2937' };
const LIGHT = { bg: '#F9FAFB', card: '#fff', border: '#E5E7EB', text: '#111827', subtext: '#6B7280', inputBg: '#F9FAFB' };

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  statCard: {
    width: '47%', borderRadius: 12, borderWidth: 1,
    padding: 12, alignItems: 'center',
  },
  statCardNum: { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  statCardLabel: { fontSize: 11 },
  tabScrollView: { paddingHorizontal: 16, marginBottom: 4 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderRadius: 20, borderWidth: 1, borderColor: 'transparent' },
  filterTabActive: { borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.1)' },
  filterTabTxt: { fontSize: 13, fontWeight: '500' },
  adCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 0 },
  adCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  adTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  adTypeTxt: { fontSize: 11, color: '#6366F1', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusTxt: { fontSize: 11, fontWeight: '600' },
  adMedia: { width: '100%', height: 140, borderRadius: 10, marginBottom: 10 },
  adTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  adBody: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(107,114,128,0.2)', marginVertical: 8 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 1 },
  adDate: { fontSize: 11, marginBottom: 10 },
  adActions: { flexDirection: 'row', gap: 8 },
  adActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10 },
  adActionTxt: { fontSize: 13, fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 60 },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  formLabel: { fontSize: 12, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  formInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
  adTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  adTypeCard: { width: '47%', borderWidth: 1.5, borderRadius: 14, padding: 12 },
  adTypeLabel: { fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 2 },
  adTypeDesc: { fontSize: 11 },
  mediaUploadBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
});