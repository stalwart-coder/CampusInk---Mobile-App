// src/services/notifications.js
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const createNotification = async ({
  userId, type, title, body, postId = null, fromUserId = null, fromUserName = null, fromUserPhoto = null,
}) => {
  if (!userId) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      type,
      title,
      body,
      postId,
      fromUserId,
      fromUserName,
      fromUserPhoto,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('Notification error:', e);
  }
};
