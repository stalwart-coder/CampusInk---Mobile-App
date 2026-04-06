// src/navigation/TabNavigator.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

import FeedScreen from '../screens/Feed/FeedScreen';
import PostDetailScreen from '../screens/Post/PostDetailScreen';
import WritePostScreen from '../screens/Post/WritePostScreen';
import GroupsScreen from '../screens/Groups/GroupsScreen';
import GroupChatScreen from '../screens/Groups/GroupChatScreen';
import GroupSettingsScreen from '../screens/Groups/GroupSettingsScreen';
import ReelsScreen from '../screens/Reels/ReelsScreen';
import EventsScreen from '../screens/Events/EventsScreen';
import LeaderboardScreen from '../screens/Leaderboard/LeaderboardScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import UserProfileScreen from '../screens/Profile/UserProfileScreen';
import AIAssistantScreen from '../screens/Profile/AIAssistantScreen';
import NotificationsScreen from '../screens/Profile/NotificationsScreen';
import AdminScreen from '../screens/Admin/AdminScreen';
import AdsScreen from '../screens/Admin/AdsScreen';
import SavedPostsScreen from '../screens/Profile/SavedPostsScreen';
import SearchScreen from '../screens/Search/SearchScreen';
import ProfileReelsScreen from '../screens/Profile/ProfileReelsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ── Feed Stack ────────────────────────────────────────────────────────────────
// FeedHome MUST be first — it is the default screen for this stack
const FeedStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="FeedHome"     component={FeedScreen} />
    <Stack.Screen name="PostDetail"   component={PostDetailScreen} />
    <Stack.Screen name="WritePost"    component={WritePostScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
    <Stack.Screen name="Search"       component={SearchScreen} />
    <Stack.Screen name="UserProfile"  component={UserProfileScreen} />
    <Stack.Screen name="Leaderboard"  component={LeaderboardScreen} />
    <Stack.Screen name="ProfileReels" component={ProfileReelsScreen} />
  </Stack.Navigator>
);

// ── Reels Stack ───────────────────────────────────────────────────────────────
const ReelsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ReelsHome"    component={ReelsScreen} />
    <Stack.Screen name="UserProfile"  component={UserProfileScreen} />
    <Stack.Screen name="ProfileReels" component={ProfileReelsScreen} />
  </Stack.Navigator>
);

// ── Groups Stack ──────────────────────────────────────────────────────────────
const GroupsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="GroupsHome"    component={GroupsScreen} />
    <Stack.Screen name="GroupChat"     component={GroupChatScreen} />
    <Stack.Screen name="GroupSettings" component={GroupSettingsScreen} />
    <Stack.Screen name="UserProfile"   component={UserProfileScreen} />
    <Stack.Screen name="PostDetail"    component={PostDetailScreen} />
  </Stack.Navigator>
);

// ── Events Stack ──────────────────────────────────────────────────────────────
const EventsStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="EventsHome"  component={EventsScreen} />
    <Stack.Screen name="UserProfile" component={UserProfileScreen} />
  </Stack.Navigator>
);

// ── Profile Stack ─────────────────────────────────────────────────────────────
const ProfileStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MyProfile"    component={ProfileScreen} />
    <Stack.Screen name="AIAssistant"  component={AIAssistantScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
    <Stack.Screen name="Admin"        component={AdminScreen} />
    <Stack.Screen name="AdsManager"   component={AdsScreen} />
    <Stack.Screen name="SavedPosts"   component={SavedPostsScreen} />
    <Stack.Screen name="Leaderboard"  component={LeaderboardScreen} />
    <Stack.Screen name="UserProfile"  component={UserProfileScreen} />
    <Stack.Screen name="PostDetail"   component={PostDetailScreen} />
    <Stack.Screen name="WritePost"    component={WritePostScreen} />
    <Stack.Screen name="ProfileReels" component={ProfileReelsScreen} />
  </Stack.Navigator>
);

// ── Custom Tab Bar ────────────────────────────────────────────────────────────
function CustomTabBar({ state, navigation }) {
  const { colors, isDark } = useTheme();

  const TABS = [
    { name: 'Feed',    icon: 'home-outline',        activeIcon: 'home',        label: 'Home'   },
    { name: 'Reels',   icon: 'play-circle-outline', activeIcon: 'play-circle', label: 'Reels'  },
    { name: 'Groups',  icon: 'people-outline',      activeIcon: 'people',      label: 'Groups' },
    { name: 'Events',  icon: 'calendar-outline',    activeIcon: 'calendar',    label: 'Events' },
    { name: 'Profile', icon: 'person-outline',      activeIcon: 'person',      label: 'Me'     },
  ];

  return (
    <View style={[
      styles.tabBar,
      {
        backgroundColor: isDark ? '#0d1117' : '#fff',
        borderTopColor: isDark ? '#1f2937' : '#E5E7EB',
        paddingBottom: Platform.OS === 'ios' ? 24 : 10,
      },
    ]}>
      {state.routes.map((route, index) => {
        const tab = TABS[index];
        if (!tab) return null;
        const focused = state.index === index;
        const isReels = tab.name === 'Reels';

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            onPress={() => navigation.navigate(route.name)}
            activeOpacity={0.7}
          >
            {isReels ? (
              <View style={[styles.reelsBtn, focused && styles.reelsBtnActive]}>
                <Ionicons
                  name={focused ? tab.activeIcon : tab.icon}
                  size={22}
                  color={focused ? '#fff' : (isDark ? '#9CA3AF' : '#6B7280')}
                />
              </View>
            ) : (
              <>
                {focused && (
                  <View style={[styles.activeBlob, { backgroundColor: colors.primary + '18' }]} />
                )}
                <Ionicons
                  name={focused ? tab.activeIcon : tab.icon}
                  size={24}
                  color={focused ? colors.primary : (isDark ? '#9CA3AF' : '#6B7280')}
                />
                <Text style={[
                  styles.tabLabel,
                  { color: focused ? colors.primary : (isDark ? '#9CA3AF' : '#6B7280') },
                ]}>
                  {tab.label}
                </Text>
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Root Navigator ────────────────────────────────────────────────────────────
export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        unmountOnBlur: false,
      }}
    >
      <Tab.Screen name="Feed"    component={FeedStack}    />
      <Tab.Screen name="Reels"   component={ReelsStack}   />
      <Tab.Screen name="Groups"  component={GroupsStack}  />
      <Tab.Screen name="Events"  component={EventsStack}  />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 4,
    alignItems: 'flex-end',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  activeBlob: {
    position: 'absolute',
    top: -2,
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  tabLabel: { fontSize: 10, fontWeight: '600', marginTop: 3 },
  reelsBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  reelsBtnActive: { backgroundColor: '#6366F1' },
});