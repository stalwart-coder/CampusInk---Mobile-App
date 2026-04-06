// src/screens/Profile/AIAssistantScreen.js
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Image, Alert, Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { askAI } from '../../services/groq';
import { generateImage } from '../../services/imageGeneration';
import moment from 'moment';

const SUGGESTIONS = [
  { text: '📚 Help me study for exams', category: 'study' },
  { text: '✍️ Blog post ideas for students', category: 'write' },
  { text: '💼 Career advice for freshers', category: 'career' },
  { text: '🎨 Generate image of a campus', category: 'image' },
  { text: '🤔 Explain machine learning simply', category: 'learn' },
  { text: '📝 Write a college application essay', category: 'write' },
];

const isImageRequest = (text) => {
  const t = text.toLowerCase();
  return t.includes('generate image') || t.includes('create image') ||
    t.includes('make image') || t.includes('draw ') ||
    t.includes('image of') || t.includes('photo of') ||
    t.includes('picture of') || t.includes('image banao') ||
    t.includes('tasveer');
};

export default function AIAssistantScreen({ navigation }) {
  const { colors } = useTheme();
  const [messages, setMessages] = useState([
    {
      id: '0',
      role: 'model',
      text: "Hi! I'm Campus Ink AI 🤖\n\nI can help you with:\n• 📚 Studies & academics\n• ✍️ Writing & content\n• 💼 Career guidance\n• 🎨 Image generation\n• 🤔 Any questions!\n\nWhat's on your mind?",
      time: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatRef = useRef();

  const sendMessage = async (text) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;
    setInput('');

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: msgText,
      time: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    setLoading(true);

    try {
      if (isImageRequest(msgText)) {
        // Image Generation
        const thinkingMsg = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: '🎨 Generating your image... This may take 10-20 seconds ⏳',
          time: new Date(),
        };
        setMessages(prev => [...prev, thinkingMsg]);
        setLoading(false);

        try {
          const imageUri = await generateImage(msgText);
          const imgMsg = {
            id: (Date.now() + 2).toString(),
            role: 'model',
            text: '✅ Here is your generated image!',
            imageUri,
            time: new Date(),
          };
          setMessages(prev => [...prev.slice(0, -1), imgMsg]);
        } catch (imgErr) {
          // Fallback to description
          setLoading(true);
          const desc = await askAI(`Describe visually in detail: ${msgText}. Be creative, vivid and descriptive.`);
          const fallbackMsg = {
            id: (Date.now() + 2).toString(),
            role: 'model',
            text: `🖼️ Image service is busy. Here's a vivid description instead:\n\n${desc}`,
            time: new Date(),
          };
          setMessages(prev => [...prev.slice(0, -1), fallbackMsg]);
        }
      } else {
        // Text Chat
        const history = messages.slice(1).filter(m => m.text).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }));

        const reply = await askAI(msgText, history);
        const aiMsg = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          text: reply,
          time: new Date(),
        };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch (err) {
      const errMsg = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Sorry, I couldn't process that. Please try again! 🙏\n\nMake sure your Groq API key is set correctly.",
        time: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const copyToClipboard = (text) => {
    Clipboard.setString(text);
    Alert.alert('✅ Copied!', 'Message clipboard mein copy ho gaya.');
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.userMsgRow]}>
        {!isUser && (
          <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 14 }}>🤖</Text>
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => {
            if (!isUser) {
              Clipboard.setString(item.text);
              Alert.alert('✅ Copied!', 'Message clipboard mein copy ho gaya.');
            }
          }}
          style={[
            styles.bubble,
            isUser
              ? { backgroundColor: colors.primary }
              : { backgroundColor: colors.card },
            isUser && styles.userBubble,
            { maxWidth: item.imageUri ? 260 : '75%' },
          ]}
        >
          {!isUser && (
            <TouchableOpacity
              style={styles.copyHint}
              onPress={() => {
                Clipboard.setString(item.text);
                Alert.alert('✅ Copied!', 'Response copy ho gaya.');
              }}
            >
              <Ionicons name="copy-outline" size={12} color={colors.textSecondary} />
              <Text style={[styles.copyHintTxt, { color: colors.textSecondary }]}>Hold to copy</Text>
            </TouchableOpacity>
          )}
          {item.imageUri ? (
            <Image
              source={{ uri: item.imageUri }}
              style={styles.generatedImage}
              resizeMode="cover"
            />
          ) : null}
          <Text style={[
            styles.bubbleText,
            { color: isUser ? '#FFF' : colors.text }
          ]}>
            {item.text}
          </Text>
          <Text style={[
            styles.msgTime,
            { color: isUser ? '#FFFFFF60' : colors.textSecondary }
          ]}>
            {moment(item.time).format('HH:mm')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={[styles.aiIconBox, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 18 }}>🤖</Text>
          </View>
          <View>
            <Text style={[styles.aiName, { color: colors.text }]}>Campus Ink AI</Text>
            <Text style={[styles.aiStatus, { color: '#2ED573' }]}>● Online · Powered by Llama 3</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Clear Chat', 'Clear conversation?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', onPress: () => setMessages([messages[0]]) },
            ]);
          }}
        >
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <View style={styles.suggestionsContainer}>
          <Text style={[styles.suggestTitle, { color: colors.textSecondary }]}>
            Try asking:
          </Text>
          <View style={styles.suggestGrid}>
            {SUGGESTIONS.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.suggestChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => sendMessage(s.text)}
              >
                <Text style={[styles.suggestText, { color: colors.text }]}>{s.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={i => i.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.msgList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing Indicator */}
      {loading && (
        <View style={styles.typingRow}>
          <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 14 }}>🤖</Text>
          </View>
          <View style={[styles.typingBubble, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.typingText, { color: colors.textSecondary }]}>
              Thinking...
            </Text>
          </View>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputRow, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Ask anything or 'generate image of...'"
          placeholderTextColor={colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
          onSubmitEditing={() => sendMessage()}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: input.trim() && !loading ? colors.primary : colors.border }
          ]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56,
    paddingBottom: 14, borderBottomWidth: 1, gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiIconBox: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  aiName: { fontSize: 16, fontWeight: '700' },
  aiStatus: { fontSize: 11, marginTop: 1 },
  suggestionsContainer: { padding: 16 },
  suggestTitle: { fontSize: 13, marginBottom: 12 },
  suggestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
  },
  suggestText: { fontSize: 12 },
  msgList: { padding: 16, gap: 10, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  userMsgRow: { flexDirection: 'row-reverse' },
  aiAvatar: {
    width: 32, height: 32, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  bubble: {
    padding: 14, borderRadius: 18, borderBottomLeftRadius: 4,
  },
  userBubble: { borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
  generatedImage: {
    width: 220, height: 220,
    borderRadius: 12, marginBottom: 8,
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  msgTime: { fontSize: 10, marginTop: 6, textAlign: 'right' },
  typingRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingHorizontal: 16, paddingBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, padding: 12, borderRadius: 18,
  },
  typingText: { fontSize: 13 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, gap: 10, borderTopWidth: 1,
  },
  textInput: {
    flex: 1, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  copyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    opacity: 0.6,
  },
  copyHintTxt: {
    fontSize: 10,
  },
});