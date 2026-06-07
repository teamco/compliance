import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouterState } from '@tanstack/react-router';
import { Bot, Send, Trash2, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '@icore/template-shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatHistory, useSaveChatMessage, useClearChatHistory } from '../../queries/settings';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export function AiAssistant() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyLoaded = useRef(false);
  const dragging = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = window.innerWidth - ev.clientX;
      setPanelWidth(Math.min(Math.max(newWidth, 280), 800));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const { data: history } = useChatHistory();
  const { mutate: saveMsg } = useSaveChatMessage();
  const { mutate: clearHistory } = useClearChatHistory();

  // Load history into messages once on first open
  useEffect(() => {
    if (open && !historyLoaded.current && history && history.length > 0) {
      historyLoaded.current = true;
      setMessages(history.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    }
  }, [open, history]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    saveMsg({ role: 'user', content: text });

    abortRef.current = new AbortController();

    let assistantContent = '';

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          messages: history,
          context: { pageContext: pathname },
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('stream_failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6)) as {
              token?: string;
              done?: boolean;
              error?: string;
            };
            if (payload.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: t('error.unknown'), streaming: false }
                    : m,
                ),
              );
              break;
            }
            if (payload.token?.trim()) {
              assistantContent += payload.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + payload.token } : m,
                ),
              );
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: t('error.unknown'), streaming: false } : m,
          ),
        );
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
      );
      setStreaming(false);
      if (assistantContent) {
        saveMsg({ role: 'assistant', content: assistantContent });
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    historyLoaded.current = false;
    clearHistory();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t('aiAssistant.title')}
          className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Bot size={20} />
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex flex-col p-0 [&>button:last-child]:hidden !w-[var(--panel-w)]"
        style={{ '--panel-w': `${panelWidth}px` } as React.CSSProperties}
      >
        {/* resize handle */}
        <div
          onMouseDown={onResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 group"
        >
          <div className="absolute inset-y-0 left-0 w-px bg-border group-hover:bg-green-500/50 group-active:bg-green-500 transition-colors" />
        </div>
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
              <Sparkles size={13} className="text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle>{t('aiAssistant.title')}</SheetTitle>
              <p className="text-[10px] text-muted-foreground">{t('aiAssistant.subtitle')}</p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
                  title={t('aiAssistant.clearChat')}
                >
                  <Trash2 size={14} />
                </button>
              )}
              <SheetClose className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer">
                <X size={14} />
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20">
                <Sparkles size={20} className="text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t('aiAssistant.welcomeTitle')}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {t('aiAssistant.welcomeBody')}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={[
                      'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-green-500/10 border border-green-500/20 text-foreground rounded-br-sm'
                        : 'bg-muted border border-border text-foreground rounded-bl-sm',
                    ].join(' ')}
                  >
                    {msg.content ? (
                      msg.role === 'assistant' ? (
                        <span className="block space-y-1.5">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="text-xs leading-relaxed">{children}</p>,
                              h1: ({ children }) => <h1 className="text-sm font-semibold mt-2 mb-1">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-xs font-semibold mt-1.5 mb-0.5">{children}</h3>,
                              ul: ({ children }) => <ul className="text-xs list-disc pl-4 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="text-xs list-decimal pl-4 space-y-0.5">{children}</ol>,
                              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                              code: ({ children, className }) =>
                                className ? (
                                  <code className="block bg-background/60 border border-border rounded px-2 py-1.5 text-[10px] font-mono overflow-x-auto whitespace-pre">{children}</code>
                                ) : (
                                  <code className="bg-background/60 border border-border rounded px-1 py-0.5 text-[10px] font-mono">{children}</code>
                                ),
                              pre: ({ children }) => <pre className="bg-background/60 border border-border rounded px-2 py-1.5 text-[10px] font-mono overflow-x-auto whitespace-pre">{children}</pre>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              blockquote: ({ children }) => <blockquote className="border-l-2 border-green-500/50 pl-2 italic text-muted-foreground">{children}</blockquote>,
                              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-500 underline underline-offset-2 hover:text-green-400">{children}</a>,
                              hr: () => <hr className="border-border my-1" />,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {msg.streaming && (
                            <span className="inline-block w-1 h-3 bg-green-500 ml-0.5 animate-pulse rounded-sm" />
                          )}
                        </span>
                      ) : (
                        <>
                          {msg.content}
                          {msg.streaming && (
                            <span className="inline-block w-1 h-3 bg-green-500 ml-0.5 animate-pulse rounded-sm" />
                          )}
                        </>
                      )
                    ) : msg.streaming ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <span className="animate-pulse">{t('aiAssistant.thinking')}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('aiAssistant.placeholder')}
            disabled={streaming}
            className="flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void send()}
            disabled={!input.trim() || streaming}
            className="shrink-0"
          >
            <Send size={13} />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
