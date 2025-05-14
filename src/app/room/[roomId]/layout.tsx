import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { roomId: string } }): Promise<Metadata> {
  const { roomId } = await params;
  return {
    title: `chat / ${roomId} | 加密聊天`,
    description: '私密加密聊天室，支持阅后即焚、文件传输、表情包。聊天内容端到端加密，完全匿名，保护您的隐私。',
    keywords: [
      '私密聊天',
      '加密聊天室',
      '阅后即焚',
      '匿名聊天',
      '一对一聊天',
      '在线聊天',
      '临时聊天室'
    ],
    robots: { index: false },
    openGraph: {
      title: `私密聊天室 #${roomId}`,
      description: '私密加密聊天室，支持阅后即焚、文件传输。聊天内容端到端加密，保护隐私。',
    },
    twitter: {
      title: `私密聊天室 #${roomId}`,
      description: '私密加密聊天室，支持阅后即焚、文件传输。聊天内容端到端加密，保护隐私。',
    }
  };
}

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
} 