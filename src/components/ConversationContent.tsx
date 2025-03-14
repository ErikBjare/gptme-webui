import type { FC } from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput, type ChatOptions } from './ChatInput';
import { useConversation } from '@/hooks/useConversation';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Loader2 } from 'lucide-react';
import type { ConversationItem } from './ConversationList';
import { useApi } from '@/contexts/ApiContext';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  conversation: ConversationItem;
}

// This can be replaced with an API call to fetch available models from the server
const AVAILABLE_MODELS = [
  'anthropic/claude-3-5-sonnet-20240620',
  'anthropic/claude-3-opus-20240229',
  'anthropic/claude-3-sonnet-20240229',
  'anthropic/claude-3-haiku-20240307',
  'openai/gpt-4-turbo',
  'openai/gpt-4',
  'openai/gpt-3.5-turbo',
];

export const ConversationContent: FC<Props> = ({ conversation }) => {
  const { conversationData, sendMessage, isLoading, isGenerating } = useConversation(conversation);
  const [showInitialSystem, setShowInitialSystem] = useState(false);
  const api = useApi();
  const queryClient = useQueryClient();

  // Reset checkbox state when conversation changes
  useEffect(() => {
    setShowInitialSystem(false);
  }, [conversation.name]);

  const { currentMessages, firstNonSystemIndex, hasSystemMessages } = useMemo(() => {
    if (!conversationData?.log) {
      return {
        currentMessages: [],
        firstNonSystemIndex: 0,
        hasSystemMessages: false,
      };
    }

    const messages = conversationData.log;

    const firstNonSystem = messages.findIndex((msg) => msg.role !== 'system');
    const hasInitialSystemMessages = firstNonSystem > 0;

    return {
      currentMessages: messages,
      firstNonSystemIndex: firstNonSystem === -1 ? messages.length : firstNonSystem,
      hasSystemMessages: hasInitialSystemMessages,
    };
  }, [conversationData]);

  // Create a ref for the scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Memoize the messages content string
  const messagesContent = useMemo(
    () => currentMessages.map((msg) => msg.content).join(''),
    [currentMessages]
  );

  // Single effect to handle all scrolling
  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    };

    // Use requestAnimationFrame for smooth scrolling
    requestAnimationFrame(scrollToBottom);
  }, [
    currentMessages.length, // Scroll on new messages
    messagesContent, // Scroll on content changes (streaming)
    conversation.name, // Scroll when conversation changes
  ]);

  const handleSendMessage = (message: string, options?: ChatOptions) => {
    if (options) {
      sendMessage({ message, options });
    } else {
      sendMessage(message);
    }
  };

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="relative flex-1 overflow-y-auto" ref={scrollContainerRef}>
        {hasSystemMessages ? (
          <div className="flex w-full items-center bg-accent/50">
            <div className="mx-auto flex max-w-3xl flex-1 items-center gap-2 p-4">
              <Checkbox
                id="showInitialSystem"
                checked={showInitialSystem}
                onCheckedChange={(checked) => {
                  if (!isLoading) {
                    setShowInitialSystem(checked as boolean);
                  }
                }}
                disabled={isLoading}
              />
              <Label
                htmlFor="showInitialSystem"
                className={`text-sm text-muted-foreground hover:text-foreground ${
                  isLoading ? 'opacity-50' : 'cursor-pointer'
                }`}
              >
                Show initial system messages
              </Label>
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        ) : null}
        {currentMessages.map((msg, index) => {
          // Hide all system messages before the first non-system message by default
          const isInitialSystem = msg.role === 'system' && index < firstNonSystemIndex;
          if (isInitialSystem && !showInitialSystem) {
            return null;
          }

          // Get the previous and next messages for spacing context
          const previousMessage = index > 0 ? currentMessages[index - 1] : null;
          const nextMessage =
            index < currentMessages.length - 1 ? currentMessages[index + 1] : null;

          return (
            <ChatMessage
              key={`${index}-${msg.timestamp}-${msg.content.length}`}
              message={msg}
              previousMessage={previousMessage}
              nextMessage={nextMessage}
              conversationId={conversation.name}
            />
          );
        })}
        {/* Add a margin at the bottom to give the last message some space and signify end of conversation */}
        <div className="mb-[10vh]"></div>
      </div>
      <ChatInput
        onSend={handleSendMessage}
        onInterrupt={async () => {
          console.log('Interrupting from ConversationContent...');
          await api.cancelPendingRequests();
          // Invalidate the query to ensure UI updates
          queryClient.invalidateQueries({
            queryKey: ['conversation', conversation.name],
          });
        }}
        isReadOnly={conversation.readonly}
        isGenerating={isGenerating}
        availableModels={AVAILABLE_MODELS}
        defaultModel={AVAILABLE_MODELS[0]}
      />
    </main>
  );
};
