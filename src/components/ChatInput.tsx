import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FC, type FormEvent, type KeyboardEvent } from 'react';
import { useApi } from '@/contexts/ApiContext';

interface Props {
  onSend: (message: string) => void;
  onInterrupt?: () => void;
  isReadOnly?: boolean;
  isGenerating?: boolean;
}

export const ChatInput: FC<Props> = ({ onSend, onInterrupt, isReadOnly, isGenerating }) => {
  const [message, setMessage] = useState('');
  const api = useApi();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isGenerating && onInterrupt) {
      console.log('[ChatInput] Interrupting generation...', { isGenerating });
      try {
        await onInterrupt();
        console.log('[ChatInput] Generation interrupted successfully', {
          isGenerating,
        });
      } catch (error) {
        console.error('[ChatInput] Error interrupting generation:', error);
      }
    } else if (message.trim()) {
      onSend(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const placeholder = isReadOnly
    ? 'This is a demo conversation (read-only)'
    : api.isConnected
      ? 'Send a message...'
      : 'Connect to gptme to send messages';

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      <div className="mx-auto flex max-w-3xl">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isGenerating ? 'Generating response...' : placeholder}
          className="min-h-[60px] rounded-r-none"
          disabled={!api.isConnected || isReadOnly || isGenerating}
        />
        <Button
          type="submit"
          className="min-h-[60px] min-w-[60px] rounded-l-none rounded-r-lg bg-green-600 hover:bg-green-700"
          disabled={!api.isConnected || isReadOnly}
        >
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <span>Stop</span>
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
};
