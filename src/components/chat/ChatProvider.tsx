"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ChatKnowledgeContext {
  nodeId?: string;
  subject?: string;
  chapter?: string;
  title?: string;
  summary?: string;
  keywords?: string[];
}

interface ChatContextValue {
  open: boolean;
  knowledgeContext: ChatKnowledgeContext | null;
  showChat: () => void;
  hideChat: () => void;
  toggleChat: () => void;
  setKnowledgeContext: (ctx: ChatKnowledgeContext | null) => void;
}

const ChatContext = createContext<ChatContextValue>({
  open: false,
  knowledgeContext: null,
  showChat: () => {},
  hideChat: () => {},
  toggleChat: () => {},
  setKnowledgeContext: () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [knowledgeContext, setKnowledgeContextState] =
    useState<ChatKnowledgeContext | null>(null);

  const showChat = useCallback(() => setOpen(true), []);
  const hideChat = useCallback(() => setOpen(false), []);
  const toggleChat = useCallback(() => setOpen((prev) => !prev), []);
  const setKnowledgeContext = useCallback(
    (ctx: ChatKnowledgeContext | null) => setKnowledgeContextState(ctx),
    [],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      open,
      knowledgeContext,
      showChat,
      hideChat,
      toggleChat,
      setKnowledgeContext,
    }),
    [open, knowledgeContext, showChat, hideChat, toggleChat, setKnowledgeContext],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  return useContext(ChatContext);
}