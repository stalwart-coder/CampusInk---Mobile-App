// src/services/groq.js
import { GROQ_API_KEY } from '../constants';

export const askAI = async (prompt, history = []) => {
  try {
    const messages = [
      {
        role: 'system',
        content: `You are Campus Ink AI Assistant — a helpful, friendly, and knowledgeable AI for college students.
You help with: academics, campus life, writing posts, study tips, career advice, events, general knowledge, coding, math, science, and more.
Keep responses concise, engaging, and student-friendly. Use emojis occasionally. 
If someone asks something inappropriate, politely decline.
Always be encouraging and positive.`,
      },
      ...history.map(h => ({
        role: h.role === 'model' ? 'assistant' : 'user',
        content: h.parts?.[0]?.text || h.content || '',
      })),
      { role: 'user', content: prompt },
    ];

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    if (data.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }

    if (data.error) {
      throw new Error(data.error.message);
    }

    throw new Error('No response from AI');
  } catch (error) {
    console.error('AI error:', error);
    throw error;
  }
};
