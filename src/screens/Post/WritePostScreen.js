// src/screens/Post/WritePostScreen.js
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { CATEGORIES, POINTS } from '../../constants';
import { uploadImage } from '../../services/cloudinary';

const MOODS = ['😊 Happy','😔 Sad','🔥 Motivated','😂 Funny','🤔 Thoughtful','😤 Frustrated','🎉 Excited','😴 Tired'];
const getReadTime = (text) => {
  const w = text.trim().split(/\s+/).filter(Boolean).length;
  const m = Math.ceil(w / 200);
  return m < 1 ? '< 1 min' : `${m} min read`;
};

export default function WritePostScreen({ navigation }) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('campus');
  const [image, setImage] = useState(null);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [mood, setMood] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [postType, setPostType] = useState('article');
  const contentRef = useRef(null);

  const pickImage = async (fromCamera = false) => {
    const fn = fromCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status } = await fn();
    if (status !== 'granted') return;
    const result = await (fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect: [16, 9],
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!t || tags.includes(t)) { setTagInput(''); return; }
    if (tags.length >= 5) { Alert.alert('Max 5 tags'); return; }
    setTags(p => [...p, t]); setTagInput('');
  };

  const insertFormat = (before, after = '') => {
    setContent(p => p + before + after);
    setTimeout(() => contentRef.current?.focus(), 100);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { Alert.alert('Missing Title', 'Please add a title.'); return; }
    if (content.trim().length < 20) { Alert.alert('Too Short', 'Write at least 20 characters.'); return; }
    setLoading(true);
    try {
      let imageUrl = '';
      if (image) { setUploadingImage(true); imageUrl = await uploadImage(image); setUploadingImage(false); }
      await addDoc(collection(db, 'posts'), {
        title: title.trim(), content: content.trim(), category, imageUrl, tags, mood, postType,
        wordCount: content.trim().split(/\s+/).filter(Boolean).length,
        readTime: getReadTime(content),
        authorId: user.uid,
        authorName: profile?.name || user.displayName || 'Campus User',
        authorPhoto: profile?.photoURL || user.photoURL || '',
        authorDepartment: profile?.department || '',
        isVerified: profile?.isVerified || false,
        likes: [], likesCount: 0, commentsCount: 0, views: 0, savedBy: [],
        reported: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', user.uid), { postsCount: increment(1), points: increment(POINTS.POST_CREATE) });
      Alert.alert('🎉 Published!', `Post is live! +${POINTS.POST_CREATE} points!`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch { Alert.alert('Error', 'Failed to publish. Try again.'); }
    finally { setLoading(false); setUploadingImage(false); }
  };

  const canPublish = title.trim().length > 0 && content.trim().length >= 20;
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Write Post</Text>
        <TouchableOpacity style={[styles.publishBtn, { backgroundColor: canPublish ? colors.primary : colors.border }]} onPress={handleSubmit} disabled={!canPublish || loading}>
          {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.publishTxt}>Publish</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Post type */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {[['article','📄','Article'],['quick','⚡','Quick'],['question','❓','Question'],['discussion','💬','Discussion']].map(([id,icon,label]) => (
            <TouchableOpacity key={id} style={[styles.typeChip, { backgroundColor: postType===id?colors.primary:colors.card, borderColor: postType===id?colors.primary:colors.border }]} onPress={() => setPostType(id)}>
              <Text>{icon}</Text>
              <Text style={[{ fontSize: 12, fontWeight: '600', color: postType===id?'#FFF':colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Category */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
            <TouchableOpacity key={cat.id} style={[styles.catChip, { backgroundColor: category===cat.id?cat.color:colors.card, borderColor: category===cat.id?cat.color:colors.border }]} onPress={() => setCategory(cat.id)}>
              <Text style={{ fontSize: 12 }}>{cat.icon}</Text>
              <Text style={[{ fontSize: 12, fontWeight: '600', color: category===cat.id?'#FFF':colors.textSecondary }]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Title */}
        <TextInput style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.border }]}
          placeholder={postType==='question'?'Your question...':postType==='discussion'?'Discussion topic...':'Post title...'}
          placeholderTextColor={colors.textSecondary} value={title} onChangeText={setTitle} maxLength={120} multiline />
        <View style={styles.titleMeta}>
          <Text style={[{ fontSize: 11, color: title.length>100?colors.error:colors.textSecondary }]}>{title.length}/120</Text>
          {content.length>0 && <Text style={[{ fontSize: 11, fontWeight: '600', color: colors.primary, backgroundColor: colors.primary+'15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }]}>⏱ {getReadTime(content)}</Text>}
        </View>

        {/* Formatting toolbar */}
        <View style={[styles.toolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[{ fontSize: 11, color: colors.textSecondary, fontWeight: '600', marginRight: 4 }]}>Format:</Text>
          {[['B',()=>insertFormat('**','**'),{fontWeight:'800'}],['I',()=>insertFormat('_','_'),{fontStyle:'italic'}],['H1',()=>insertFormat('\n# '),{}],['•',()=>insertFormat('\n• '),{}],['❝',()=>insertFormat('\n> '),{}]].map(([lbl,fn,st],i) => (
            <TouchableOpacity key={i} style={[styles.toolBtn, { backgroundColor: colors.inputBg }]} onPress={fn}>
              <Text style={[styles.toolBtnTxt, { color: colors.text }, st]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.toolBtn, { backgroundColor: mood?colors.primary+'20':colors.inputBg }]} onPress={() => setShowMoodPicker(true)}>
            <Text style={styles.toolBtnTxt}>{mood?mood.split(' ')[0]:'😊'}</Text>
          </TouchableOpacity>
        </View>

        {/* Cover Image */}
        {image ? (
          <View style={{ margin: 16, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
            <Image source={{ uri: image }} style={{ width: '100%', height: 200, borderRadius: 16 }} />
            {uploadingImage && <View style={styles.uploadOverlay}><ActivityIndicator color="#FFF" size="large" /><Text style={{ color: '#FFF', marginTop: 8 }}>Uploading...</Text></View>}
            <TouchableOpacity style={{ position: 'absolute', top: 10, right: 10 }} onPress={() => setImage(null)}><Ionicons name="close-circle" size={28} color="#FFF" /></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.imgBtns}>
            <TouchableOpacity style={[styles.imgBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => pickImage(false)}>
              <Ionicons name="image-outline" size={18} color={colors.primary} /><Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text }]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.imgBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => pickImage(true)}>
              <Ionicons name="camera-outline" size={18} color={colors.primary} /><Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text }]}>Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        <TextInput ref={contentRef} style={[styles.contentInput, { color: colors.text }]}
          placeholder={postType==='quick'?'Share a quick update...':postType==='question'?'Describe your question in detail...':postType==='discussion'?'Start the discussion...':'Write your story here...\n\n• Hook readers in first line\n• Use paragraphs\n• End with a question'}
          placeholderTextColor={colors.textSecondary} value={content} onChangeText={setContent} multiline textAlignVertical="top" />

        {/* Stats */}
        <View style={[styles.statsBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>{wordCount} words · {content.length} chars</Text>
          {content.length > 0 && content.length < 20 && <Text style={{ color: colors.error, fontSize: 12 }}>{20-content.length} more chars needed</Text>}
        </View>

        {/* Tags */}
        <View style={[styles.tagsSection, { borderTopColor: colors.border }]}>
          <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 }]}>🏷️ Tags <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>(up to 5)</Text></Text>
          <View style={[styles.tagInputRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="pricetag-outline" size={15} color={colors.textSecondary} />
            <TextInput style={[{ flex: 1, fontSize: 14, color: colors.text }]} placeholder="Add tag..." placeholderTextColor={colors.textSecondary} value={tagInput} onChangeText={setTagInput} onSubmitEditing={addTag} returnKeyType="done" autoCapitalize="none" maxLength={20} />
            <TouchableOpacity style={[styles.addTagBtn, { backgroundColor: tagInput.trim()?colors.primary:colors.border }]} onPress={addTag} disabled={!tagInput.trim()}>
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>Add</Text>
            </TouchableOpacity>
          </View>
          {tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(tag => (
                <TouchableOpacity key={tag} style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.primary+'15', borderWidth: 1, borderColor: colors.primary+'40' }]} onPress={() => setTags(p => p.filter(t => t !== tag))}>
                  <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.primary }]}>#{tag}</Text>
                  <Ionicons name="close" size={12} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {mood && (
          <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[{ color: colors.text, fontSize: 14 }]}>Feeling: {mood}</Text>
            <TouchableOpacity onPress={() => setMood('')}><Ionicons name="close" size={16} color={colors.textSecondary} /></TouchableOpacity>
          </View>
        )}

        {/* Tips */}
        <View style={[{ margin: 16, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 8 }]}>✍️ Tips</Text>
          <Text style={[{ fontSize: 13, lineHeight: 22, color: colors.textSecondary }]}>{'• Strong hook in first sentence\n• Cover image = 3x more views\n• Use #tags for discoverability\n'}+{POINTS.POST_CREATE} points on publish 🎯</Text>
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Mood Modal */}
      <Modal visible={showMoodPicker} transparent animationType="fade">
        <TouchableOpacity style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }]} activeOpacity={1} onPress={() => setShowMoodPicker(false)}>
          <View style={[{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }]}>
            <Text style={[{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }]}>How are you feeling?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {MOODS.map(m => (
                <TouchableOpacity key={m} style={[{ width: '22%', alignItems: 'center', padding: 12, borderRadius: 14, gap: 4, backgroundColor: mood===m?colors.primary+'20':colors.inputBg }, mood===m&&{ borderWidth: 1.5, borderColor: colors.primary }]} onPress={() => { setMood(m); setShowMoodPicker(false); }}>
                  <Text style={{ fontSize: 22 }}>{m.split(' ')[0]}</Text>
                  <Text style={[{ fontSize: 10, fontWeight: '600', color: colors.text, textAlign: 'center' }]}>{m.split(' ').slice(1).join(' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  publishBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 70, alignItems: 'center' },
  publishTxt: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  typeRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  titleInput: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, lineHeight: 30 },
  titleMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, gap: 6, flexWrap: 'wrap' },
  toolBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  toolBtnTxt: { fontSize: 13, fontWeight: '600' },
  imgBtns: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 14 },
  imgBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 13, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', gap: 7 },
  uploadOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  contentInput: { paddingHorizontal: 16, paddingTop: 14, fontSize: 16, lineHeight: 28, minHeight: 220 },
  statsBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  tagsSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderTopWidth: 1 },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginBottom: 10 },
  addTagBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
});