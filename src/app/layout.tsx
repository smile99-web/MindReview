import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatLauncher } from "@/components/chat/ChatLauncher";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { StudyTimeTracker } from "@/components/study-time/StudyTimeTracker";
import { ErrorReporter } from "@/components/ErrorReporter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "知图复习 MindReview",
  description: "面向中学生的知识点拆解 + 思维导图 + 主动复习系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#f0f2f5]">
        <ErrorReporter />
        <AuthProvider>
          <ChatProvider>
            <ErrorBoundary>
              <Navbar />
              <main className="flex-1 pt-14">
                {children}
              </main>
              <ChatLauncher />
              <ChatPanel />
              <StudyTimeTracker />
            </ErrorBoundary>
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
