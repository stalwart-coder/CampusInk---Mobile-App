// src/screens/Events/EventsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, ScrollView,
  Image, Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { db } from '../../services/firebase';
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, doc, updateDoc, deleteDoc,
  arrayUnion, arrayRemove, getDoc,
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { uploadImage } from '../../services/cloudinary';
import moment from 'moment';

const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🌐', color: '#6366F1' },
  { id: 'academic', label: 'Academic', emoji: '📚', color: '#43D1A6' },
  { id: 'sports', label: 'Sports', emoji: '⚽', color: '#FFA502' },
  { id: 'cultural', label: 'Cultural', emoji: '🎭', color: '#FF6584' },
  { id: 'tech', label: 'Tech', emoji: '💻', color: '#5352ED' },
  { id: 'social', label: 'Social', emoji: '🎉', color: '#2ED573' },
  { id: 'workshop', label: 'Workshop', emoji: '🛠️', color: '#FF4757' },
];

const BLANK_FORM = {
  title: '', description: '', date: '', time: '',
  venue: '', category: 'academic', maxAttendees: '',
  registrationLink: '', prize: '', fee: '',
};

export default function EventsScreen({ navigation }) {
  const { colors } = useTheme();
  const { user, profile, isAdmin } = useAuth();

  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('upcoming');
  const [catFilter, setCatFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [detailModal, setDetailModal] = useState(null); // event object
  const [creating, setCreating] = useState(false);
  const [coverImage, setCoverImage] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [editMode, setEditMode] = useState(false);
  const [editEventId, setEditEventId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'events'), orderBy('eventDate', 'asc'));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const now = new Date();

  const filteredEvents = events.filter(e => {
    const eDate = e.eventDate?.toDate ? e.eventDate.toDate() : new Date(e.eventDate);
    const timeOk = filter === 'upcoming' ? eDate >= now : eDate < now;
    const catOk = catFilter === 'all' || e.category === catFilter;
    return timeOk && catOk;
  });

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85, allowsEditing: true, aspect: [16, 9],
    });
    if (!r.canceled) setCoverImage(r.assets[0].uri);
  };

  const saveEvent = async () => {
    if (!form.title.trim() || !form.date.trim() || !form.venue.trim()) {
      Alert.alert('Missing Fields', 'Title, date aur venue required hai.'); return;
    }
    setCreating(true);
    try {
      let imageUrl = editMode && detailModal?.imageUrl ? detailModal.imageUrl : '';
      if (coverImage) imageUrl = await uploadImage(coverImage);

      const parts = form.date.split('-');
      const timeParts = (form.time || '00:00').split(':');
      const eventDate = new Date(+parts[0], +parts[1] - 1, +parts[2], +timeParts[0] || 0, +timeParts[1] || 0);

      const data = {
        title: form.title.trim(),
        description: form.description.trim(),
        eventDate,
        venue: form.venue.trim(),
        category: form.category,
        imageUrl,
        organizer: profile?.name || user.displayName || 'Campus Ink',
        organizerId: user.uid,
        maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees) : null,
        registrationLink: form.registrationLink.trim(),
        prize: form.prize.trim(),
        fee: form.fee.trim(),
        updatedAt: serverTimestamp(),
      };

      if (editMode && editEventId) {
        await updateDoc(doc(db, 'events', editEventId), data);
        Alert.alert('✅ Updated!', 'Event update ho gaya.');
      } else {
        await addDoc(collection(db, 'events'), {
          ...data,
          attendees: [],
          attendeesCount: 0,
          createdAt: serverTimestamp(),
        });
        Alert.alert('🎉 Created!', 'Event live hai!');
      }
      resetForm();
    } catch (e) {
      Alert.alert('Error', 'Failed: ' + e.message);
    } finally { setCreating(false); }
  };

  const resetForm = () => {
    setForm(BLANK_FORM);
    setCoverImage(null);
    setCreateModal(false);
    setEditMode(false);
    setEditEventId(null);
  };

  const openEdit = (event) => {
    const eDate = event.eventDate?.toDate ? event.eventDate.toDate() : new Date(event.eventDate);
    setForm({
      title: event.title || '',
      description: event.description || '',
      date: eDate.toISOString().split('T')[0],
      time: `${String(eDate.getHours()).padStart(2, '0')}:${String(eDate.getMinutes()).padStart(2, '0')}`,
      venue: event.venue || '',
      category: event.category || 'academic',
      maxAttendees: event.maxAttendees ? String(event.maxAttendees) : '',
      registrationLink: event.registrationLink || '',
      prize: event.prize || '',
      fee: event.fee || '',
    });
    setEditEventId(event.id);
    setEditMode(true);
    setDetailModal(null);
    setCreateModal(true);
  };

  const deleteEvent = (event) => {
    Alert.alert('Delete Event', `"${event.title}" delete karo?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteDoc(doc(db, 'events', event.id)).catch(() => {});
          setDetailModal(null);
          Alert.alert('Deleted', 'Event delete ho gaya.');
        },
      },
    ]);
  };

  const rsvp = async (event) => {
    if (!user) return;
    const isGoing = (event.attendees || []).includes(user.uid);
    if (!isGoing && event.maxAttendees && event.attendeesCount >= event.maxAttendees) {
      Alert.alert('Full!', 'Event mein seats full hain.'); return;
    }
    const ref = doc(db, 'events', event.id);
    await updateDoc(ref, {
      attendees: isGoing ? arrayRemove(user.uid) : arrayUnion(user.uid),
      attendeesCount: isGoing
        ? Math.max(0, (event.attendeesCount || 1) - 1)
        : (event.attendeesCount || 0) + 1,
    }).catch(() => {});
    if (detailModal?.id === event.id) {
      const snap = await getDoc(ref);
      setDetailModal({ id: snap.id, ...snap.data() });
    }
  };

  const canManage = (event) => isAdmin || event?.organizerId === user?.uid;

  const renderEventCard = ({ item }) => {
    const eDate = item.eventDate?.toDate ? item.eventDate.toDate() : new Date(item.eventDate);
    const isPast = eDate < now;
    const isGoing = (item.attendees || []).includes(user?.uid);
    const isFull = item.maxAttendees && item.attendeesCount >= item.maxAttendees;
    const cat = CATEGORIES.find(c => c.id === item.category);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }, isPast && { opacity: 0.75 }]}
        onPress={() => setDetailModal(item)}
        activeOpacity={0.85}
      >
        {item.imageUrl
          ? <Image source={{ uri: item.imageUrl }} style={styles.cardImg} />
          : <View style={[styles.cardImgPlaceholder, { backgroundColor: (cat?.color || colors.primary) + '25' }]}>
              <Text style={{ fontSize: 44 }}>{cat?.emoji || '📅'}</Text>
            </View>
        }

        {/* Badges */}
        <View style={styles.cardBadgeRow}>
          {cat && cat.id !== 'all' && (
            <View style={[styles.catBadge, { backgroundColor: cat.color + '20' }]}>
              <Text style={[styles.catBadgeTxt, { color: cat.color }]}>{cat.emoji} {cat.label}</Text>
            </View>
          )}
          {isPast && <View style={[styles.catBadge, { backgroundColor: colors.border }]}><Text style={[styles.catBadgeTxt, { color: colors.textSecondary }]}>Past</Text></View>}
          {isGoing && <View style={[styles.catBadge, { backgroundColor: '#10B98120' }]}><Text style={[styles.catBadgeTxt, { color: '#10B981' }]}>✓ Going</Text></View>}
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.primary} />
            <Text style={[styles.metaTxt, { color: colors.textSecondary }]}>{moment(eDate).format('ddd, MMM D • h:mm A')}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.primary} />
            <Text style={[styles.metaTxt, { color: colors.textSecondary }]} numberOfLines={1}>{item.venue}</Text>
          </View>
          <View style={styles.cardFooter}>
            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.metaTxt, { color: colors.textSecondary }]}>
                {item.attendeesCount || 0}{item.maxAttendees ? `/${item.maxAttendees}` : ''} going
              </Text>
            </View>
            {!isPast && (
              <TouchableOpacity
                style={[styles.rsvpChip, {
                  backgroundColor: isGoing ? '#EF444420' : isFull ? colors.border : colors.primary,
                }]}
                onPress={() => rsvp(item)}
                disabled={isFull && !isGoing}
              >
                <Text style={[styles.rsvpChipTxt, { color: isGoing ? '#EF4444' : isFull ? colors.textSecondary : '#FFF' }]}>
                  {isGoing ? 'Cancel' : isFull ? 'Full' : 'RSVP'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 56 : 46 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Events</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
            {filteredEvents.length} {filter} events
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.createBtn, { backgroundColor: colors.primary }]}
          onPress={() => { setEditMode(false); setForm(BLANK_FORM); setCoverImage(null); setCreateModal(true); }}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.createBtnTxt}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming / Past */}
      <View style={[styles.filterRow, { backgroundColor: colors.card }]}>
        {['upcoming', 'past'].map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterBtnTxt, { color: filter === f ? '#FFF' : colors.textSecondary }]}>
              {f === 'upcoming' ? '🗓 Upcoming' : '📋 Past'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category filter */}
      <FlatList
        data={CATEGORIES}
        horizontal showsHorizontalScrollIndicator={false}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.catRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.catChip, { backgroundColor: catFilter === item.id ? item.color : colors.card, borderColor: catFilter === item.id ? item.color : colors.border }]}
            onPress={() => setCatFilter(item.id)}
          >
            <Text style={[styles.catChipTxt, { color: catFilter === item.id ? '#FFF' : colors.textSecondary }]}>
              {item.id !== 'all' ? item.emoji + ' ' : ''}{item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading
        ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        : <FlatList
            data={filteredEvents}
            keyExtractor={i => i.id}
            renderItem={renderEventCard}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={{ fontSize: 52 }}>📭</Text>
                <Text style={[styles.emptyTxt, { color: colors.text }]}>No {filter} events</Text>
                <TouchableOpacity
                  style={[styles.createBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
                  onPress={() => { setForm(BLANK_FORM); setCreateModal(true); }}
                >
                  <Ionicons name="add" size={18} color="#FFF" />
                  <Text style={styles.createBtnTxt}>Create Event</Text>
                </TouchableOpacity>
              </View>
            }
          />
      }

      {/* ── Event Detail Modal ── */}
      <Modal visible={!!detailModal} animationType="slide" onRequestClose={() => setDetailModal(null)}>
        {detailModal && (() => {
          const eDate = detailModal.eventDate?.toDate ? detailModal.eventDate.toDate() : new Date(detailModal.eventDate);
          const isPast = eDate < now;
          const isGoing = (detailModal.attendees || []).includes(user?.uid);
          const isFull = detailModal.maxAttendees && detailModal.attendeesCount >= detailModal.maxAttendees;
          const cat = CATEGORIES.find(c => c.id === detailModal.category);

          return (
            <ScrollView style={[styles.detailContainer, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>
              {/* Cover */}
              <View style={styles.detailCoverWrap}>
                {detailModal.imageUrl
                  ? <Image source={{ uri: detailModal.imageUrl }} style={styles.detailCover} resizeMode="cover" />
                  : <View style={[styles.detailCover, { backgroundColor: (cat?.color || colors.primary) + '30', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 72 }}>{cat?.emoji || '📅'}</Text>
                    </View>
                }
                <TouchableOpacity style={styles.detailBack} onPress={() => setDetailModal(null)}>
                  <Ionicons name="arrow-back" size={22} color="#FFF" />
                </TouchableOpacity>
                {canManage(detailModal) && (
                  <View style={styles.detailManageBtns}>
                    <TouchableOpacity style={styles.manageBtn} onPress={() => openEdit(detailModal)}>
                      <Ionicons name="create-outline" size={18} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.manageBtn, { backgroundColor: '#EF4444' }]} onPress={() => deleteEvent(detailModal)}>
                      <Ionicons name="trash-outline" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.detailBody}>
                {/* Category badge */}
                {cat && cat.id !== 'all' && (
                  <View style={[styles.catBadge, { backgroundColor: cat.color + '20', alignSelf: 'flex-start', marginBottom: 10 }]}>
                    <Text style={[styles.catBadgeTxt, { color: cat.color }]}>{cat.emoji} {cat.label}</Text>
                  </View>
                )}

                <Text style={[styles.detailTitle, { color: colors.text }]}>{detailModal.title}</Text>

                {/* Info rows */}
                {[
                  { icon: 'calendar-outline', text: moment(eDate).format('dddd, MMMM D, YYYY') },
                  { icon: 'time-outline', text: moment(eDate).format('h:mm A') },
                  { icon: 'location-outline', text: detailModal.venue },
                  { icon: 'person-outline', text: `Organized by ${detailModal.organizer}` },
                  { icon: 'people-outline', text: `${detailModal.attendeesCount || 0}${detailModal.maxAttendees ? `/${detailModal.maxAttendees}` : ''} attending` },
                  detailModal.fee ? { icon: 'cash-outline', text: `Entry: ${detailModal.fee}` } : null,
                  detailModal.prize ? { icon: 'trophy-outline', text: `Prize: ${detailModal.prize}` } : null,
                  detailModal.registrationLink ? { icon: 'link-outline', text: detailModal.registrationLink } : null,
                ].filter(Boolean).map((row, idx) => (
                  <View key={idx} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                    <Ionicons name={row.icon} size={18} color={colors.primary} />
                    <Text style={[styles.detailRowTxt, { color: colors.text }]}>{row.text}</Text>
                  </View>
                ))}

                {detailModal.description ? (
                  <View style={[styles.descCard, { backgroundColor: colors.card }]}>
                    <Text style={[styles.descTitle, { color: colors.text }]}>About</Text>
                    <Text style={[styles.descTxt, { color: colors.textSecondary }]}>{detailModal.description}</Text>
                  </View>
                ) : null}

                {/* RSVP button */}
                {!isPast && (
                  <TouchableOpacity
                    style={[styles.rsvpBtn, {
                      backgroundColor: isGoing ? '#EF444415' : isFull ? colors.border : colors.primary,
                      borderWidth: isGoing ? 1.5 : 0,
                      borderColor: isGoing ? '#EF4444' : 'transparent',
                    }]}
                    onPress={() => rsvp(detailModal)}
                    disabled={isFull && !isGoing}
                  >
                    <Ionicons name={isGoing ? 'close-circle-outline' : 'checkmark-circle-outline'} size={22} color={isGoing ? '#EF4444' : isFull ? colors.textSecondary : '#FFF'} />
                    <Text style={[styles.rsvpBtnTxt, { color: isGoing ? '#EF4444' : isFull ? colors.textSecondary : '#FFF' }]}>
                      {isGoing ? 'Cancel RSVP' : isFull ? 'Event Full' : '✓ RSVP — I\'m Going!'}
                    </Text>
                  </TouchableOpacity>
                )}

                {isPast && (
                  <View style={[styles.pastBanner, { backgroundColor: colors.card }]}>
                    <Text style={[{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }]}>This event has ended • {detailModal.attendeesCount || 0} attended</Text>
                  </View>
                )}
              </View>
              <View style={{ height: 60 }} />
            </ScrollView>
          );
        })()}
      </Modal>

      {/* ── Create/Edit Event Modal ── */}
      <Modal visible={createModal} animationType="slide" onRequestClose={resetForm}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={resetForm}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editMode ? 'Edit Event' : 'Create Event'}
            </Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: form.title && form.date && form.venue ? colors.primary : colors.border }]}
              onPress={saveEvent}
              disabled={creating || !form.title || !form.date || !form.venue}
            >
              {creating ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnTxt}>{editMode ? 'Update' : 'Create'}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Cover image */}
            <TouchableOpacity style={[styles.coverPicker, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={pickCover}>
              {coverImage
                ? <Image source={{ uri: coverImage }} style={{ width: '100%', height: '100%', borderRadius: 14 }} resizeMode="cover" />
                : <>
                    <Ionicons name="image-outline" size={30} color={colors.textSecondary} />
                    <Text style={[styles.coverPickerTxt, { color: colors.textSecondary }]}>Add Cover Photo (16:9)</Text>
                  </>
              }
            </TouchableOpacity>

            {/* Category */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catOption, { backgroundColor: form.category === cat.id ? cat.color : colors.inputBg }]}
                  onPress={() => setForm(p => ({ ...p, category: cat.id }))}
                >
                  <Text>{cat.emoji}</Text>
                  <Text style={[styles.catOptionTxt, { color: form.category === cat.id ? '#FFF' : colors.text }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Form fields */}
            {[
              { key: 'title', label: 'Event Title *', icon: 'text-outline', placeholder: 'e.g. Annual Tech Fest 2025' },
              { key: 'venue', label: 'Venue *', icon: 'location-outline', placeholder: 'e.g. Main Auditorium, Block A' },
              { key: 'date', label: 'Date * (YYYY-MM-DD)', icon: 'calendar-outline', placeholder: '2025-12-25' },
              { key: 'time', label: 'Time (HH:MM)', icon: 'time-outline', placeholder: '14:30' },
              { key: 'maxAttendees', label: 'Max Attendees (optional)', icon: 'people-outline', placeholder: 'e.g. 200', keyboard: 'number-pad' },
              { key: 'fee', label: 'Entry Fee (optional)', icon: 'cash-outline', placeholder: 'e.g. Free / ₹50' },
              { key: 'prize', label: 'Prize / Reward (optional)', icon: 'trophy-outline', placeholder: 'e.g. ₹10,000 cash prize' },
              { key: 'registrationLink', label: 'Registration Link (optional)', icon: 'link-outline', placeholder: 'https://...' },
            ].map(f => (
              <View key={f.key}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name={f.icon} size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.inputField, { color: colors.text }]}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={form[f.key]}
                    onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                    keyboardType={f.keyboard || 'default'}
                  />
                </View>
              </View>
            ))}

            {/* Description */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.inputBg, borderColor: colors.border, alignItems: 'flex-start', paddingTop: 12 }]}>
              <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} style={{ marginTop: 2 }} />
              <TextInput
                style={[styles.inputField, { color: colors.text, minHeight: 90, textAlignVertical: 'top' }]}
                placeholder="Event details, schedule, requirements..."
                placeholderTextColor={colors.textSecondary}
                value={form.description}
                onChangeText={v => setForm(p => ({ ...p, description: v }))}
                multiline
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 14 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  createBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, gap: 5 },
  createBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  filterRow: { flexDirection: 'row', marginHorizontal: 18, borderRadius: 14, padding: 4, marginBottom: 12 },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  filterBtnTxt: { fontWeight: '600', fontSize: 13 },
  catRow: { paddingHorizontal: 18, paddingBottom: 12, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catChipTxt: { fontSize: 13, fontWeight: '600' },
  list: { padding: 14, gap: 14, paddingBottom: 100 },
  card: { borderRadius: 20, overflow: 'hidden', elevation: 2, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  cardImg: { width: '100%', height: 170 },
  cardImgPlaceholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center' },
  cardBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 12 },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  catBadgeTxt: { fontSize: 12, fontWeight: '700' },
  cardBody: { padding: 14, paddingTop: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, lineHeight: 23 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  metaTxt: { fontSize: 13 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  rsvpChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  rsvpChipTxt: { fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTxt: { fontSize: 17, fontWeight: '600' },
  // Detail modal
  detailContainer: { flex: 1 },
  detailCoverWrap: { position: 'relative' },
  detailCover: { width: '100%', height: 260 },
  detailBack: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 9 },
  detailManageBtns: { position: 'absolute', top: 50, right: 16, flexDirection: 'row', gap: 8 },
  manageBtn: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 9 },
  detailBody: { padding: 20 },
  detailTitle: { fontSize: 24, fontWeight: '800', marginBottom: 16, lineHeight: 30 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5 },
  detailRowTxt: { fontSize: 15, flex: 1, lineHeight: 22 },
  descCard: { borderRadius: 16, padding: 16, marginTop: 16 },
  descTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  descTxt: { fontSize: 14, lineHeight: 22 },
  rsvpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, marginTop: 20, gap: 8 },
  rsvpBtnTxt: { fontSize: 16, fontWeight: '700' },
  pastBanner: { borderRadius: 16, padding: 16, marginTop: 20 },
  // Create modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 56 : 46, paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12 },
  saveBtnTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  modalBody: { padding: 18 },
  coverPicker: { height: 140, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  coverPickerTxt: { fontSize: 14, marginTop: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 7, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14, gap: 10 },
  inputField: { flex: 1, fontSize: 15 },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, marginRight: 8 },
  catOptionTxt: { fontSize: 13, fontWeight: '600' },
});