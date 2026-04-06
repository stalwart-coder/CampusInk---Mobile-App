// src/components/ads/AdBanner.js
// Shows advertisement banners in the feed between posts
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebase';
import {
  collection, query, where, getDocs,
  doc, updateDoc, increment, orderBy, limit,
} from 'firebase/firestore';
import { useTheme } from '../../context/ThemeContext';

export default function AdBanner() {
  const { colors, isDark } = useTheme();
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadAd();
  }, []);

  const loadAd = async () => {
    try {
      const q = query(
        collection(db, 'ads'),
        where('status', '==', 'active'),
        limit(10)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        // Pick a random active ad
        const ads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const randomAd = ads[Math.floor(Math.random() * ads.length)];
        setAd(randomAd);

        // Track impression
        await updateDoc(doc(db, 'ads', randomAd.id), {
          impressions: increment(1),
        });
      }
    } catch (e) {
      // Silently fail — don't crash feed
    } finally {
      setLoading(false);
    }
  };

  const handleCtaPress = async () => {
    if (!ad) return;
    try {
      // Track click
      await updateDoc(doc(db, 'ads', ad.id), {
        clicks: increment(1),
      });
      // Open link
      if (ad.link) {
        await Linking.openURL(ad.link);
      }
    } catch (e) {}
  };

  if (loading || !ad || dismissed) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Sponsored label */}
      <View style={styles.sponsoredRow}>
        <View style={[styles.sponsoredBadge, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="megaphone-outline" size={10} color={colors.textSecondary} />
          <Text style={[styles.sponsoredText, { color: colors.textSecondary }]}>Sponsored</Text>
        </View>
        <TouchableOpacity onPress={() => setDismissed(true)} style={styles.dismissBtn}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Banner image */}
      {ad.mediaUrl ? (
        <TouchableOpacity onPress={handleCtaPress} activeOpacity={0.9}>
          <Image
            source={{ uri: ad.mediaUrl }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ) : null}

      {/* Ad content */}
      <View style={styles.adContent}>
        <View style={styles.adTextRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.adTitle, { color: colors.text }]} numberOfLines={1}>
              {ad.title}
            </Text>
            {ad.body ? (
              <Text style={[styles.adBody, { color: colors.textSecondary }]} numberOfLines={2}>
                {ad.body}
              </Text>
            ) : null}
          </View>
          {ad.cta ? (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
              onPress={handleCtaPress}
            >
              <Text style={styles.ctaText}>{ad.cta}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sponsoredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sponsoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sponsoredText: { fontSize: 10, fontWeight: '600' },
  dismissBtn: { padding: 4 },
  bannerImage: {
    width: '100%',
    height: 160,
  },
  adContent: {
    padding: 12,
  },
  adTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  adBody: { fontSize: 12, lineHeight: 17 },
  ctaBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  ctaText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});