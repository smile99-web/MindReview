"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/auth";
import { LatexText } from "@/components/ui/LatexText";
import { useChat, type ChatKnowledgeContext } from "./ChatProvider";

interface ConversationSummary {
  id: string;
  title: string;
  knowledgeNodeId: string | null;
  updatedAt: string;
  lastMessage: {
    role: "user" | "assistant";
    content: string;
    imageUrl: string | null;
    createdAt: string;
  } | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl: string | null;
  imagePrompt: string | null;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  title: string;
  knowledgeNodeId: string | null;
  messages: ChatMessage[];
}

const WELCOME_HINT =
  "你可以在学习任何概念时点「AI 老师」来问我 — 比如“这道题怎么做”、" +
  "“为什么电势能是标量”、" +
  "“帮我画一张细胞分裂的示意图”";

export function ChatPanel() {
  const { open, hideChat, knowledgeContext } = useChat();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 会话切换竞态守卫：loadConversation 的请求序号，过期响应直接丢弃
  const loadReqRef = useRef(0);
  // activeId 的 ref 镜像：handleSend 的异步回调里需要拿到"发送后是否已切会话"
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await authFetch("/api/chat");
      if (!res.ok) {
        setConversations([]);
        return;
      }
      const data = await res.json();
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  // 加载单个会话消息
  const loadConversation = useCallback(async (id: string) => {
    const reqId = ++loadReqRef.current;
    setLoadingMessages(true);
    setError(null);
    try {
      const res = await authFetch(`/api/chat/${id}`);
      // 快速连点切换会话时，先发出的请求可能后返回——过期响应必须丢弃，
      // 否则 A 会话的消息会覆盖正在看的 B 会话
      if (reqId !== loadReqRef.current) return;
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `加载失败 (${res.status})`);
      }
      const data = (await res.json()) as ConversationDetail;
      if (reqId !== loadReqRef.current) return;
      setMessages(data.messages || []);
    } catch (err) {
      if (reqId !== loadReqRef.current) return;
      setError(err instanceof Error ? err.message : "加载失败");
      setMessages([]);
    } finally {
      if (reqId === loadReqRef.current) setLoadingMessages(false);
    }
  }, []);

  // 打开面板时拉历史
  useEffect(() => {
    if (!open) return;
    void loadConversations();
  }, [open, loadConversations]);

  // 切到新会话时拉消息
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadConversation(activeId);
  }, [activeId, loadConversation]);

  // 滚到底
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, open]);

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setDraft("");
    setError(null);

    // 乐观插入用户消息
    const tempUser: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: text,
      imageUrl: null,
      imagePrompt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);
    setSending(true);
    const convAtSend = activeId;

    try {
      const res = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId || undefined,
          message: text,
          knowledgeContext: knowledgeContext || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `请求失败 (${res.status})`);
      }
      const assistant: ChatMessage = {
        id: data.assistantMessage.id,
        role: "assistant",
        content: data.assistantMessage.content,
        imageUrl: data.assistantMessage.imageUrl,
        imagePrompt: data.assistantMessage.imagePrompt,
        createdAt: data.assistantMessage.createdAt,
      };
      // 等待响应期间用户已切走：消息已落库，切回去时会重新加载，
      // 这里不能把 A 会话的回复插进 B 会话的消息列表
      if (activeIdRef.current === convAtSend) {
        setMessages((prev) => [...prev, assistant]);
      }
      if (data.isNewConversation) {
        // 与消息插入同一个竞态守卫：等待响应期间用户已切到其他会话，
        // 不能把 TA 的视图强行拽回刚创建的新会话
        if (activeIdRef.current === convAtSend) {
          setActiveId(data.conversationId);
        }
        // 顺手刷新列表（放守卫外无妨，只更新侧栏）
        void loadConversations();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  }, [draft, sending, activeId, knowledgeContext, loadConversations]);

  const handleDeleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm("确定删除这个对话吗？")) return;
      try {
        // 必须检查 res.ok：authFetch 只在 401/网络异常时抛错，服务端
        // 500/403 会正常 resolve——不检查会把没删成的会话从 UI 抹掉，
        // 刷新后"复活"（UI/服务端状态分叉）
        const res = await authFetch(`/api/chat/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `删除失败 (${res.status})`);
        }
        if (activeId === id) {
          setActiveId(null);
          setMessages([]);
        }
        setConversations((prev) => prev.filter((c) => c.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    },
    [activeId],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  // 关闭时清理
  const onClose = useCallback(() => {
    hideChat();
  }, [hideChat]);

  const headerSubtitle = useMemo(() => {
    if (knowledgeContext?.title) {
      return `当前知识点：${knowledgeContext.title}`;
    }
    return "学习中遇到不懂的概念，随时问我";
  }, [knowledgeContext]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="AI 老师答疑"
    >
      {/* 背景遮罩 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
        aria-label="关闭"
      />

      {/* 抽屉面板 — 从左侧滑出 */}
      <aside className="absolute left-0 top-0 bottom-0 w-full sm:w-[480px] md:w-[540px] bg-white shadow-2xl flex flex-col animate-slide-in-left">
        {/* 头部 */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 bg-gradient-to-r from-indigo-500/[0.04] to-purple-500/[0.04]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-base shadow-sm">
              🤖
            </span>
            <div className="min-w-0">
              <h2 className="font-semibold text-slate-800 text-[15px]">AI 老师</h2>
              <p className="text-xs text-slate-500 truncate">{headerSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="关闭"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* 主体：左侧历史 + 右侧对话 */}
        <div className="flex-1 flex min-h-0">
          {/* 历史列表 */}
          <nav className="w-32 sm:w-40 border-r border-slate-200/70 bg-slate-50/40 flex flex-col">
            <button
              type="button"
              onClick={startNewConversation}
              className="m-2 px-2.5 py-2 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center justify-center gap-1"
            >
              <span className="text-sm leading-none">+</span>
              新对话
            </button>
            <div className="flex-1 overflow-y-auto px-1 pb-2 space-y-0.5">
              {loadingConvs ? (
                <div className="px-2 py-3 text-xs text-slate-400">加载中…</div>
              ) : conversations.length === 0 ? (
                <div className="px-2 py-3 text-xs text-slate-400">暂无历史对话</div>
              ) : (
                conversations.map((c) => {
                  const isActive = activeId === c.id;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveId(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setActiveId(c.id);
                      }}
                      className={`group relative rounded-lg px-2.5 py-2 cursor-pointer transition-colors text-xs ${
                        isActive
                          ? "bg-indigo-100/80 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <div className="truncate font-medium pr-5">{c.title || "新对话"}</div>
                      {c.lastMessage && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {c.lastMessage.role === "assistant" ? "🤖 " : "🧒 "}
                          {c.lastMessage.imageUrl ? "[图片]" : c.lastMessage.content.slice(0, 20)}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(c.id, e)}
                        className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                        aria-label="删除对话"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </nav>

          {/* 对话区 */}
          <section className="flex-1 flex flex-col min-w-0 bg-slate-50/30">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && !loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="text-sm text-slate-500">{WELCOME_HINT}</p>
                  {knowledgeContext?.summary && (
                    <div className="mt-4 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100/80 text-left">
                      <p className="text-xs font-semibold text-indigo-700 mb-1">
                        📖 {knowledgeContext.title || "当前知识点"}
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {knowledgeContext.summary}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                messages.map((m) => <MessageBubble key={m.id} message={m} />)
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white border border-slate-200/70 px-3 py-2 shadow-sm flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* 输入框 */}
            <div className="border-t border-slate-200/70 bg-white px-3 py-3">
              {knowledgeContext && (
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    📚 {knowledgeContext.title || "当前知识点"}
                  </span>
                  <span>已作为上下文发给 AI</span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的问题，回车发送，Shift+回车换行"
                  rows={2}
                  disabled={sending}
                  className="flex-1 resize-none rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-400 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                  aria-label="发送"
                >
                  {sending ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 text-center">
                内容由 AI 生成，可能有误，请结合教材判断
              </p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  // 文本：保留 LaTeX 渲染
  const formattedText = useMemo(() => {
    let text = message.content || "";
    // 把连续换行折叠成段落分隔
    text = text.replace(/\r\n/g, "\n");
    return text;
  }, [message.content]);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 px-1">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-[10px]">
              🤖
            </span>
            AI 老师
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words ${
            isUser
              ? "bg-indigo-500 text-white rounded-br-md"
              : "bg-white border border-slate-200/70 text-slate-800 rounded-bl-md"
          }`}
        >
          {formattedText ? (
            isUser ? (
              formattedText
            ) : (
              <LatexText text={formattedText} />
            )
          ) : (
            <span className="text-slate-400 text-xs italic">（无文字回复）</span>
          )}
        </div>
        {message.imageUrl && (
          <div className="rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-sm max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- AI providers return temporary external URLs that are not known at build time. */}
            <img
              src={message.imageUrl}
              alt={message.imagePrompt || "AI 生成配图"}
              className="rounded-lg w-full h-auto"
            />
            {message.imagePrompt && (
              <p className="text-[10px] text-slate-400 mt-1 px-1 line-clamp-2">
                🎨 {message.imagePrompt}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}