import { useState, useRef, useEffect } from 'react';
import ChatWindow from './components/ChatWindow.jsx';
import SearchSuggestions from './components/SearchSuggestions.jsx';
import TabBar from './components/TabBar.jsx';
import Dashboard from './components/Dashboard.jsx';
import ProfileView from './components/ProfileView.jsx';
import CommentDrafter from './components/CommentDrafter.jsx';
import styles from './App.module.css';

let msgId = 0;
const nextId = () => ++msgId;

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [claudeHistory, setClaudeHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [commentDrafterDoc, setCommentDrafterDoc] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (activeTab === 'chat') inputRef.current?.focus();
  }, [activeTab]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Switch to chat tab when sending
    setActiveTab('chat');
    setError(null);
    setInput('');
    setLoading(true);

    const userMsg = { id: nextId(), role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: claudeHistory }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg = {
        id: nextId(),
        role: 'assistant',
        text: data.response,
        results: data.results || null,
        pagination: data.pagination || null,
        userQuery: trimmed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setClaudeHistory(data.history || []);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: null,
          isError: true,
          errorText: err.message,
          results: null,
          pagination: null,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function loadMore(msgIdToUpdate, pagination) {
    try {
      const res = await fetch('/api/load-more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: pagination.toolName,
          toolInput: pagination.toolInput,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== msgIdToUpdate) return msg;
          const existingItems = Array.isArray(msg.results?.data?.data)
            ? msg.results.data.data
            : [];
          const newItems = Array.isArray(data.results?.data?.data)
            ? data.results.data.data
            : [];
          return {
            ...msg,
            results: {
              ...data.results,
              data: {
                ...data.results?.data,
                data: [...existingItems, ...newItems],
              },
            },
            pagination: data.pagination || null,
          };
        })
      );
    } catch (err) {
      alert(`Failed to load more: ${err.message}`);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const showSuggestions = messages.length === 0;

  return (
    <div className={styles.app}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerIconWrap}>🏛️</div>
        <div>
          <h1 className={styles.headerTitle}>Regulations.gov Assistant</h1>
          <p className={styles.headerSub}>
            U.S. federal rules, comments &amp; dockets — live data
          </p>
        </div>
        <span className={styles.headerBadge}>Live API</span>
      </header>

      {/* Tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main content */}
      <main className={styles.main}>
        {activeTab === 'chat' && (
          showSuggestions ? (
            <SearchSuggestions onSelect={(q) => sendMessage(q)} />
          ) : (
            <ChatWindow
              messages={messages}
              loading={loading}
              onLoadMore={loadMore}
              onDraftComment={(doc) => setCommentDrafterDoc(doc)}
            />
          )
        )}

        {activeTab === 'dashboard' && <Dashboard />}

        {activeTab === 'profile' && <ProfileView />}
      </main>

      {/* Input bar — only in chat tab */}
      {activeTab === 'chat' && (
        <footer className={styles.footer}>
          <div className={styles.inputRow}>
            <textarea
              ref={inputRef}
              className={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about regulations, rules, dockets, or comments…"
              rows={1}
              disabled={loading}
            />
            <button
              className={styles.sendBtn}
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
          <p className={styles.hint}>
            Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
          </p>
        </footer>
      )}

      {/* Comment Drafter Modal */}
      {commentDrafterDoc && (
        <CommentDrafter
          doc={commentDrafterDoc}
          onClose={() => setCommentDrafterDoc(null)}
        />
      )}
    </div>
  );
}
