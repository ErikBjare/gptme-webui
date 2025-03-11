import { type FC } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { setDocumentTitle } from '@/utils/title';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MenuBar } from '@/components/MenuBar';
import { LeftSidebar } from '@/components/LeftSidebar';
import { RightSidebar } from '@/components/RightSidebar';
import { ConversationContentV2 } from '@/components/ConversationContentV2';
import { useApi } from '@/contexts/ApiContext';
import type { ConversationItem } from '@/components/ConversationList';
import { toConversationItems } from '@/utils/conversation';
import { demoConversations, type DemoConversation } from '@/democonversations';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface Props {
  className?: string;
}

const IndexV2: FC<Props> = () => {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const conversationParam = searchParams.get('conversation');
  const [selectedConversation, setSelectedConversation] = useState<string>(
    conversationParam || demoConversations[0].name
  );
  const { api, isConnected, baseUrl } = useApi();
  const queryClient = useQueryClient();

  // Update selected conversation when URL param changes
  useEffect(() => {
    if (conversationParam) {
      setSelectedConversation(conversationParam);
    }
  }, [conversationParam]);

  // Fetch conversations from API with proper caching
  const {
    data: apiConversations = [],
    isError,
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['conversations', baseUrl, isConnected],
    queryFn: async () => {
      console.log('Fetching conversations, connection state:', isConnected);
      if (!isConnected) {
        console.warn('Attempting to fetch conversations while disconnected');
        return [];
      }
      try {
        const conversations = await api.getConversations();
        console.log('Fetched conversations:', conversations);
        return conversations;
      } catch (err) {
        console.error('Failed to fetch conversations:', err);
        throw err;
      }
    },
    enabled: isConnected,
    staleTime: 0, // Always refetch when query is invalidated
    gcTime: 5 * 60 * 1000,
  });

  // Log any query errors
  if (isError) {
    console.error('Conversation query error:', error);
  }

  // Combine demo and API conversations
  const allConversations: ConversationItem[] = [
    // Convert demo conversations to ConversationItems
    ...demoConversations.map((conv: DemoConversation) => ({
      name: conv.name,
      lastUpdated: conv.lastUpdated,
      messageCount: conv.messages.length,
      readonly: true,
    })),
    // Convert API conversations to ConversationItems
    ...toConversationItems(apiConversations),
  ];

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === selectedConversation) {
        return;
      }
      // Cancel any pending queries for the previous conversation
      queryClient.cancelQueries({
        queryKey: ['conversation', selectedConversation],
      });
      setSelectedConversation(id);
      // Update URL with the new conversation ID
      navigate(`?conversation=${id}`);
    },
    [selectedConversation, queryClient, navigate]
  );

  const conversation =
    allConversations.find((conv) => conv.name === selectedConversation) ?? allConversations[0]; // Fallback to first conversation if none selected

  // Update document title when selected conversation changes
  useEffect(() => {
    if (conversation) {
      setDocumentTitle(conversation.name);
    } else {
      setDocumentTitle();
    }
    return () => setDocumentTitle(); // Reset title on unmount
  }, [conversation]);

  return (
    <div className="flex h-screen flex-col">
      <MenuBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          isOpen={leftSidebarOpen}
          onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
          conversations={allConversations}
          selectedConversationId={selectedConversation}
          onSelectConversation={handleSelectConversation}
          isLoading={isLoading}
          isError={isError}
          error={error as Error}
          onRetry={() => refetch()}
        />
        <ConversationContentV2 conversation={conversation} />
        <RightSidebar
          isOpen={rightSidebarOpen}
          onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
        />
      </div>
    </div>
  );
};

export default IndexV2;
