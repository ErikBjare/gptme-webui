import type { FC } from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useConversationV2 } from '@/hooks/useConversationV2';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Loader2 } from 'lucide-react';
import type { ConversationItem } from './ConversationList';
import { useQueryClient } from '@tanstack/react-query';
import { ToolConfirmationDialog } from './ToolConfirmationDialog';

interface Props {
  conversation: ConversationItem;
}

export const ConversationContentV2: FC<Props> = ({ conversation }) => {
  const {
    conversationData,
    sendMessage,
    isLoading,
    isGenerating,
    pendingTool,
    confirmTool,
    interruptGeneration,
  } = useConversationV2(conversation);

  const [showInitialSystem, setShowInitialSystem] = useState(false);
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

  // Handle tool confirmation
  const handleConfirmTool = async () => {
    await confirmTool('confirm');
  };

  const handleEditTool = async (content: string) => {
    await confirmTool('edit', { content });
  };

  const handleSkipTool = async () => {
    await confirmTool('skip');
  };

  const handleAutoConfirmTool = async (count: number) => {
    await confirmTool('auto', { count });
  };

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Tool Confirmation Dialog */}
      <ToolConfirmationDialog
        pendingTool={pendingTool}
        onConfirm={handleConfirmTool}
        onEdit={handleEditTool}
        onSkip={handleSkipTool}
        onAuto={handleAutoConfirmTool}
      />

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
        onSend={sendMessage}
        onInterrupt={async () => {
          console.log('Interrupting from ConversationContentV2...');
          // Use the V2 API's interrupt method
          await interruptGeneration();
          // Invalidate the query to ensure UI updates
          queryClient.invalidateQueries({
            queryKey: ['conversation', conversation.name],
          });
        }}
        isReadOnly={conversation.readonly}
        isGenerating={isGenerating}
      />
    </main>
  );
};
