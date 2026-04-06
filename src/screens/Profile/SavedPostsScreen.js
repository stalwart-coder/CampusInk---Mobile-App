// src/screens/Profile/SavedPostsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import PostCard from '../../components/post/PostCard';

export default function SavedPostsScreen({ navigation }) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSaved();
  }, []);

  const fetchSaved = async () => {
    if (!profile?.savedPosts?.length) {
      setLoading(false);
      return;
    }
    try {
      const saved = profile.savedPosts.slice(0, 10);
      const q = query(collection(db, 'posts'), where('__name__', 'in', saved));
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Saved Posts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 10, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>🔖</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No saved posts</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Tap the bookmark icon on any post to save it here
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
  title: { flex: 1, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
