"use client";

import { useChat } from "./ChatProvider";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Left-side floating tab for opening the AI tutor chat panel.
 * Visible on every authenticated page (rendered in the global layout).
 */
export function ChatLauncher() {
  const { open, toggleChat } = useChat();
  const { user } = useAuth();
  // 未登录时不渲染：登录页/首页上悬浮的"AI 老师"按钮会把未登录用户
  // 引进一个必然 401 的聊天面板
  if (!user) return null;

  return (
    <button
      type="button"
      onClick={toggleChat}
      aria-label={open ? "关闭AI问答" : "打开AI问答"}
      title={open ? "关闭AI问答" : "AI 老师答疑"}
      className={`fixed left-0 top-1/2 -translate-y-1/2 z-40
        group flex items-center gap-2
        pl-1 pr-2.5 py-3
        rounded-r-2xl rounded-l-none
        bg-gradient-to-b from-indigo-500 to-indigo-600
        text-white
        shadow-[0_8px_24px_rgba(79,70,229,0.35)]
        hover:shadow-[0_12px_32px_rgba(79,70,229,0.45)]
        hover:from-indigo-600 hover:to-indigo-700
        transition-all duration-200
        ${open ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white/15 group-hover:bg-white/25 transition-colors">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
      </span>
      <span
        className="text-[13px] font-medium tracking-wide"
        style={{ writingMode: "vertical-rl" }}
      >
        AI 老师
      </span>
    </button>
  );
}