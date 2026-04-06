// src/hooks/useAppUpdates.js
// OTA update logic — use this in App.js
import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

export default function useAppUpdates() {
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Only run in production (not in dev/Expo Go)
    if (__DEV__) return;
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    try {
      setIsChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        // Download update in background
        await Updates.fetchUpdateAsync();

        // Ask user to restart
        Alert.alert(
          '🚀 Naya Update Available!',
          'App ka naya version aa gaya hai. Restart karo aur enjoy karo!',
          [
            {
              text: 'Baad mein',
              style: 'cancel',
            },
            {
              text: 'Abhi Restart Karo',
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      }
    } catch (e) {
      // Update check fail — silent fail, app works normally
      console.log('[Updates] Check failed:', e.message);
    } finally {
      setIsChecking(false);
    }
  };

  return { isChecking, checkForUpdate };
}