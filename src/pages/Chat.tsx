/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Conversation } from '../lib/chatDb';
import {
  fetchConversations,
  createConversation,
  touchConversation,
  saveMessage,
  fetchMessages,
  deleteConversation,
} from '../lib/chatDb';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/chat.css';
import { MODELS } from '../lib/models';

type Message = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  isThinking?: boolean;
  thinkingSteps?: string[];
  isStreaming?: boolean;
  attachments?: { id: string; url?: string; name: string; type: string }[];
};

// Removed dummy HTML parser

export default function ChatPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  // ── Load conversations when user is known ───────────────────────────────
  const loadConversations = useCallback(async (uid: string) => {
    const list = await fetchConversations(uid);
    setConversations(list);
  }, []);

  useEffect(() => {
    if (user?.id) loadConversations(user.id);
  }, [user?.id, loadConversations]);

  // ── Switch to a conversation ────────────────────────────────────────────
  const openConversation = useCallback(async (conv: Conversation) => {
    setActiveConvId(conv.id);
    setMessages([]);
    const rows = await fetchMessages(conv.id);
    setMessages(
      rows.map((r: any, i: number) => ({
        id: `db-${i}`,
        role: r.role === 'assistant' ? 'ai' : 'user',
        content: r.content,
      }))
    );
    const model = MODELS.find(m => m.id === conv.model_id) ?? MODELS[0];
    setActiveModel(model);
    if (window.innerWidth <= 768) setIsSidebarOpen(false);
  }, []);

  // ── New chat ────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(async (convId: string) => {
    await deleteConversation(convId);
    if (activeConvIdRef.current === convId) {
      startNewChat();
    }
    if (user?.id) loadConversations(user.id);
  }, [startNewChat, user?.id, loadConversations]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [activeModel, setActiveModel] = useState(MODELS[0]);

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<{ id: string; file: File; previewUrl?: string }[]>([]);

  // ── Chat persistence state ──────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  activeConvIdRef.current = activeConvId;

  // Voice Input Setup
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const textBeforeListenRef = useRef('');
  const recognitionRef = useRef<any>(null);

  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Animation refs
  const stopRequested = useRef(false);
  const messageIdCounter = useRef(0);

  // Voice Input Effect
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'id-ID';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceError('');
      };

      recognition.onresult = (event: any) => {
        let sessionTranscript = '';
        for (let i = 0; i < event.results.length; ++i) {
          sessionTranscript += event.results[i][0].transcript;
        }
        const prevText = textBeforeListenRef.current;
        const separator = prevText && !prevText.endsWith(' ') ? ' ' : '';
        const newText = prevText + separator + sessionTranscript;

        setInputText(newText);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 220) + 'px';
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setVoiceError('Izin mikrofon ditolak.');
        } else if (event.error === 'no-speech') {
          setVoiceError('Tidak ada suara terdeteksi.');
        } else {
          setVoiceError('Terjadi kesalahan pengenalan suara.');
        }
        setTimeout(() => setVoiceError(''), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      recognitionRef.current?.stop();
    } else {
      if (!recognitionRef.current) {
        setVoiceError('Browser tidak mendukung fitur suara.');
        setTimeout(() => setVoiceError(''), 3000);
        return;
      }
      textBeforeListenRef.current = inputText;
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Auto-scroll
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  // Click outside model dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 220) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUseChip = (text: string) => {
    setInputText(text);
    if (textareaRef.current) {
      textareaRef.current.value = text;
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    
    const newFiles = await Promise.all(files.map(async file => {
      const id = Math.random().toString(36).substring(7);
      let previewUrl;
      if (file.type.startsWith('image/')) {
        previewUrl = await getBase64(file);
      }
      return { id, file, previewUrl };
    }));
    
    setAttachments(prev => [...prev, ...newFiles]);
    if (e.target) e.target.value = ''; // Reset input
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const stopGeneration = () => {
    stopRequested.current = true;
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && attachments.length === 0) || isGenerating || !user?.id) return;

    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const currentAttachments = [...attachments];
    setAttachments([]);

    messageIdCounter.current += 1;
    const userId = `user-${messageIdCounter.current}`;
    messageIdCounter.current += 1;
    const aiId = `ai-${messageIdCounter.current}`;

    const newMsg: Message = { 
      id: userId, 
      role: 'user', 
      content: text,
      attachments: currentAttachments.map(a => ({ id: a.id, url: a.previewUrl, name: a.file.name, type: a.file.type }))
    };
    const aiPlaceholder: Message = { id: aiId, role: 'ai', content: '', isThinking: true, thinkingSteps: [], isStreaming: false };

    setMessages(prev => [...prev, newMsg, aiPlaceholder]);
    setIsGenerating(true);
    stopRequested.current = false;

    // ── Ensure conversation exists in DB ──────────────────────────────────
    let convId = activeConvIdRef.current;
    if (!convId) {
      const title = text ? text.slice(0, 60) : 'Chat dengan Lampiran';
      convId = await createConversation(user.id, title, activeModel.id);
      if (convId) {
        setActiveConvId(convId);
        activeConvIdRef.current = convId;
        loadConversations(user.id);
      }
    }

    // Save user message
    if (convId) await saveMessage(convId, 'user', text);

    const conversation = [...messages, newMsg]
      .filter(m => m.content.trim() !== '' || (m.attachments && m.attachments.length > 0))
      .map(m => {
        let content: any = m.content;
        if (m.attachments && m.attachments.length > 0) {
          const parts: any[] = [];
          if (m.content) parts.push({ type: 'text', text: m.content });
          m.attachments.forEach(att => {
            if (att.url && att.type.startsWith('image/')) {
              parts.push({
                type: 'image_url',
                image_url: { url: att.url }
              });
            }
          });
          if (parts.length > 0) content = parts;
        }
        return { role: m.role === 'ai' ? 'assistant' : 'user', content };
      });

    fetchRealResponse(aiPlaceholder.id, conversation, convId);
  };

  const fetchRealResponse = async (
    aiMsgId: string,
    conversation: { role: string; content: string }[],
    convId: string | null,
  ) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel.id,
          messages: conversation,
          userId: user?.id,
        }),
      });

      // Handle non-stream error responses
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        const data = await response.json();
        throw new Error(data.error || data.detail?.error || 'Terjadi kesalahan pada server.');
      }

      if (stopRequested.current) {
        setIsGenerating(false);
        setMessages(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, isThinking: false, isStreaming: false } : msg));
        return;
      }

      setMessages(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, isThinking: false, isStreaming: true } : msg));

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream tidak tersedia');

      const decoder = new TextDecoder();
      let fullReply = '';
      let buffer = '';

      while (true) {
        if (stopRequested.current) { reader.cancel(); break; }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.nimbus_done) continue;
            const delta = parsed?.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullReply += delta;
              setMessages(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, content: fullReply } : msg));
            }
          } catch { /* skip malformed */ }
        }
      }

      setMessages(prev => prev.map(msg => msg.id === aiMsgId ? { ...msg, isStreaming: false } : msg));

      // Save AI reply to DB
      if (convId && fullReply) {
        await saveMessage(convId, 'assistant', fullReply, activeModel.id);
        await touchConversation(convId);
        if (user?.id) loadConversations(user.id);
      }
    } catch (err: unknown) {
      setMessages(prev => prev.map(msg => msg.id === aiMsgId ? {
        ...msg,
        content: `Maaf, terjadi kesalahan: ${(err as Error).message}`,
        isThinking: false,
        isStreaming: false,
      } : msg));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="chat-layout">
      {/* SIDEBAR OVERLAY (mobile) */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* SIDEBAR */}
      <div className={`chat-sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`} id="sidebar">
        <div className="sidebar-head">
          <Link to="/" className="logo-wrap">
            <img src="/image/logo/N-v1.png" alt="Nimbus" width={28} height={28} className="rounded-md object-contain" />
            <span className="logo-name">Nimbus</span>
          </Link>
          <button
            className="icon-btn"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarCollapsed(true);
              }
            }}
            title="Tutup sidebar"
          >
            <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
        </div>

        <button className="new-chat-btn" onClick={startNewChat}>
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Chat baru
        </button>

        <div className="chat-list">
          {conversations.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 12px' }}>Belum ada riwayat chat.</div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`chat-item ${conv.id === activeConvId ? 'active' : ''}`}
                onClick={() => openConversation(conv)}
              >
                <span className="chat-item-text">{conv.title}</span>
                <button 
                  className="chat-item-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                  title="Hapus chat"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <Link to="/usage" className="sidebar-footer-btn" style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            Usage
          </Link>
          <Link to="/billing" className="sidebar-footer-btn" style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            Billing
          </Link>
          <Link to="/settings" className="sidebar-footer-btn" style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07A10 10 0 0 1 19.07 4.93" /></svg>
            Pengaturan
          </Link>
          <button className="sidebar-footer-btn" onClick={() => supabase.auth.signOut()}>
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'} · Keluar
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="chat-main">
        {/* TOPBAR */}
        <div className="chat-topbar">
          <button className="liquid-icon-btn d-md-none" onClick={() => setIsSidebarOpen(true)}>
            <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>

          {isSidebarCollapsed && (
            <button className="liquid-icon-btn" style={{ display: 'flex' }} onClick={() => setIsSidebarCollapsed(false)} title="Buka sidebar">
              <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          )}

          {/* model selector moved to input bubble */}

          <div className="topbar-actions">
            <button className="liquid-icon-btn" onClick={startNewChat} title="Chat baru">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>
        </div>

        {/* CHAT AREA */}
        <div className="chat-area" ref={chatAreaRef}>
          <div className="messages-wrap">
            {messages.length === 0 ? (
              <div className="welcome">
                <img src="/image/logo/N-v1.png" alt="Nimbus" width={52} height={52} className="rounded-xl object-contain mb-5" />
                <h2>Halo, Iqbal 👋</h2>
                <p>Tanyakan apa saja. Saya siap bantu dengan kode, analisis, penulisan, atau apapun.</p>
                <div className="suggestion-chips">
                  <div className="chip" onClick={() => handleUseChip("Bantu debug kode saya")}>Bantu debug kode saya</div>
                  <div className="chip" onClick={() => handleUseChip("Jelaskan konsep Supabase RLS")}>Jelaskan konsep Supabase RLS</div>
                  <div className="chip" onClick={() => handleUseChip("Review arsitektur Next.js")}>Review arsitektur Next.js</div>
                  <div className="chip" onClick={() => handleUseChip("Tulis unit test untuk fungsi ini")}>Tulis unit test untuk fungsi ini</div>
                  <div className="chip" onClick={() => handleUseChip("Translate teks ke Bahasa Inggris")}>Translate teks ke Bahasa Inggris</div>
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`msg-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.role === 'user' ? (
                    <>
                      <div className="msg-sender"><span className="sender-dot"></span>Iqbal</div>
                      <div className="user-bubble">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="attachment-grid">
                            {msg.attachments.map(att => (
                              att.url ? (
                                <img key={att.id} src={att.url} alt="attachment" className="attach-img" />
                              ) : (
                                <div key={att.id} className="attach-file-pill">
                                  <svg className="attach-file-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                  {att.name}
                                </div>
                              )
                            ))}
                          </div>
                        )}
                        {msg.content && <div>{msg.content.split('\n').map((line, i) => <React.Fragment key={i}>{line}<br /></React.Fragment>)}</div>}
                      </div>
                    </>
                  ) : (
                    <>
                      {msg.isThinking ? (
                        <div className="thinking-shell">
                          <div className="thinking-status">
                            <svg className="thinking-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                            </svg>
                            {activeModel.label} sedang berpikir...
                          </div>
                          {msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                            <div className="thinking-steps">
                              {msg.thinkingSteps.map((step, i) => {
                                const isDone = i < (msg.thinkingSteps?.length || 0) - 1 || (!msg.isThinking && !msg.isStreaming);
                                return (
                                  <div key={i} className={`thinking-step ${!isDone ? 'step-pulsing' : ''}`} style={{ animationDelay: `${i * 0.05}s` }}>
                                    {step}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="msg-sender" style={{ marginBottom: 8 }}>
                            <div style={{ width: 20, height: 20, background: 'var(--accent)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" /></svg>
                            </div>
                            {activeModel.label}
                          </div>
                          <div className="ai-bubble">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code(props: any) {
                                  const { children, className, node, ...rest } = props;
                                  const match = /language-(\w+)/.exec(className || '');
                                  return match ? (
                                    <div className="code-block">
                                      <div className="code-block-header">
                                        <span className="code-lang">{match[1]}</span>
                                        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ''))}>
                                          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                          Salin
                                        </button>
                                      </div>
                                      <pre>
                                        <code className={className} {...rest}>
                                          {children}
                                        </code>
                                      </pre>
                                    </div>
                                  ) : (
                                    <code className={className} {...rest}>
                                      {children}
                                    </code>
                                  )
                                }
                              }}
                            >
                              {msg.content + (msg.isStreaming ? ' ▍' : '')}
                            </ReactMarkdown>
                            {!msg.isStreaming && (
                              <div className="ai-actions">
                                <button className="action-btn">
                                  <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                  Salin
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="input-zone">
          <div className={`input-shell ${isListening ? 'listening-active' : ''}`}>
            
            <div className={`attach-strip ${attachments.length > 0 ? 'has-items' : ''}`}>
              {attachments.map(att => (
                <div key={att.id} className="attach-preview">
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt="preview" className="attach-preview-img" />
                  ) : (
                    <div className="attach-preview-file">
                      <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      {att.file.name.length > 15 ? att.file.name.slice(0,15) + '...' : att.file.name}
                    </div>
                  )}
                  <button className="attach-remove" onClick={() => removeAttachment(att.id)}>
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>

            <textarea
              className="msg-input"
              ref={textareaRef}
              placeholder="Ask a follow-up"
              rows={1}
              value={inputText}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
            ></textarea>

            <div className="input-bottom">
              <div className="input-bottom-left">
                <div className="attach-wrapper" ref={attachMenuRef}>
                  <button
                    type="button"
                    className="plus-btn"
                    onClick={(e) => { e.stopPropagation(); setIsAttachMenuOpen(prev => !prev); }}
                    title="Lampirkan file atau gambar"
                  >
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>

                  {isAttachMenuOpen && (
                    <div className="attach-menu">
                      <button className="attach-menu-item" onClick={() => { setIsAttachMenuOpen(false); imageInputRef.current?.click(); }}>
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        Gambar
                      </button>
                      <button className="attach-menu-item" onClick={() => { setIsAttachMenuOpen(false); fileInputRef.current?.click(); }}>
                        <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                        File
                      </button>
                    </div>
                  )}
                  
                  {/* Hidden inputs */}
                  <input type="file" className="hidden-input" style={{ display: 'none' }} ref={imageInputRef} accept="image/*" multiple onChange={handleFileSelect} />
                  <input type="file" className="hidden-input" style={{ display: 'none' }} ref={fileInputRef} accept="*/*" multiple onChange={handleFileSelect} />
                </div>

                <div
                  className="model-pill-btn"
                  ref={modelSelectorRef}
                  onClick={(e) => { e.stopPropagation(); setIsModelDropdownOpen(prev => !prev); }}
                  style={{ position: 'relative' }}
                >
                  <img src={activeModel.logo} width={16} height={16} alt={activeModel.label} className="model-logo" style={{ borderRadius: 4 }} />
                  {activeModel.label}
                  <svg viewBox="0 0 24 24" className="chevron-down"><polyline points="6 9 12 15 18 9" /></svg>

                  {isModelDropdownOpen && (
                    <div className="model-dropdown open" style={{ bottom: 'calc(100% + 8px)', top: 'auto', left: 0 }}>
                      {MODELS.map(model => (
                        <div
                          key={model.id}
                          className={`model-opt ${activeModel.id === model.id ? 'selected' : ''}`}
                          onClick={() => setActiveModel(model)}
                        >
                          <img src={model.logo} width={18} height={18} alt={model.label} className="model-opt-logo" />
                          <div className="model-opt-info">
                            <div className="model-opt-name">{model.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="input-bottom-right">
                {/* right side icons only */}

                <button className={`mic-btn ${isListening ? 'listening' : ''}`} onClick={toggleListening} title={isListening ? "Cancel / Stop voice input" : "Voice input"} type="button">
                  {isListening ? (
                    <>
                      <div className="voice-visualizer">
                        <span></span><span></span><span></span><span></span>
                      </div>
                      <svg className="stop-icon" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" fill="none" strokeWidth="2.5" /></svg>
                    </>
                  ) : (
                    <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
                  )}
                </button>

                {isGenerating ? (
                  <button className="stop-btn-circle" onClick={stopGeneration}>
                    <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
                  </button>
                ) : (
                  <button className="send-btn-circle" disabled={!inputText.trim() && attachments.length === 0} onClick={handleSend} title="Kirim">
                    <svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="input-footer">
            {voiceError ? (
              <span className="voice-error">{voiceError}</span>
            ) : (
              "Nimbus bisa membuat kesalahan. Verifikasi informasi penting."
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
