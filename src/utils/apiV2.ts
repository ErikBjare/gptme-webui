import type {
  ConversationResponse,
  SendMessageRequest,
  CreateConversationRequest,
} from '@/types/api';
import type { Message } from '@/types/conversation';

const DEFAULT_API_URL = 'http://127.0.0.1:5000';

// Import ApiError type just for the error handler
import type { ApiError } from '@/types/api';

// Error type for API client
export class ApiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'ApiClientError';
  }

  static isApiError(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError;
  }
}

// Type guard for API error responses
function isApiErrorResponse(response: unknown): response is ApiError {
  return typeof response === 'object' && response !== null && 'error' in response;
}

// New types for V2 API
export interface ToolPendingEvent {
  type: 'tool_pending';
  tool_id: string;
  tool: string;
  args: string[];
  content: string;
  auto_confirm: boolean;
}

export interface ToolOutputEvent {
  type: 'tool_output';
  tool_id: string;
  output: Message;
}

export interface ToolConfirmationRequest {
  session_id: string;
  tool_id: string;
  action: 'confirm' | 'edit' | 'skip' | 'auto';
  content?: string;
  count?: number;
}

export class ApiClientV2 {
  public baseUrl: string;
  private _isConnected: boolean = false;
  private controller: AbortController | null = null;
  private sessions: Map<string, string> = new Map(); // Map conversation IDs to session IDs
  private eventSources: Map<string, EventSource> = new Map(); // Map conversation IDs to EventSource instances
  private isCleaningUp = false;

  constructor(baseUrl: string = DEFAULT_API_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetchWithTimeout(
    url: string,
    options: globalThis.RequestInit = {},
    timeoutMs: number = 5000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async fetchJson<T>(url: string, options: globalThis.RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new ApiClientError(`HTTP error! status: ${response.status}`, response.status);
    }

    const data = await response.json();

    // Check if the response is an error
    if (isApiErrorResponse(data)) {
      throw new ApiClientError(data.error, data.status);
    }

    return data as T;
  }

  public async cancelPendingRequests() {
    if (this.isCleaningUp) return;

    try {
      this.isCleaningUp = true;
      if (this.controller) {
        this.controller.abort();
        // Wait a bit for abort event handlers to complete
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
        this.controller = null;
      }

      // Close all event sources
      for (const [conversationId, eventSource] of this.eventSources.entries()) {
        eventSource.close();
        this.eventSources.delete(conversationId);
      }
    } finally {
      this.isCleaningUp = false;
    }
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async checkConnection(): Promise<boolean> {
    try {
      // Check the V2 API
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/v2`, {}, 3000);

      if (!response.ok) {
        console.error('API endpoint returned non-OK status:', response.status);
        this._isConnected = false;
        return false;
      }

      // Try to parse the response to ensure it's valid JSON
      try {
        await response.json();
      } catch (parseError) {
        console.error('Failed to parse API response:', parseError);
        this._isConnected = false;
        return false;
      }

      this._isConnected = true;
      return true;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error('Network error - server may be down or CORS not configured');
      } else {
        console.error('Connection check failed:', error);
      }
      this._isConnected = false;
      return false;
    }
  }

  // Add method to explicitly set connection state
  setConnected(connected: boolean) {
    if (connected && !this._isConnected) {
      console.warn('Manually setting connected state without verification');
    }
    this._isConnected = connected;
  }

  // V2 API: Session Management
  async createOrGetSession(conversationId: string): Promise<string> {
    console.log(`[ApiClientV2] Creating or getting session for conversation: ${conversationId}`);
    console.log(`[ApiClientV2] Current sessions:`, Array.from(this.sessions.entries()));

    // If we already have a session ID for this conversation, return it
    if (this.sessions.has(conversationId)) {
      const sessionId = this.sessions.get(conversationId)!;
      console.log(`[ApiClientV2] Found existing session: ${sessionId}`);
      return sessionId;
    }

    console.log(`[ApiClientV2] No existing session, creating new one...`);

    try {
      // First check if the conversation exists to avoid errors
      try {
        console.log(`[ApiClientV2] Checking if conversation exists: ${conversationId}`);
        await this.fetchJson<ConversationResponse>(
          `${this.baseUrl}/api/v2/conversations/${conversationId}`,
          {
            method: 'GET',
          }
        );
        console.log(`[ApiClientV2] Conversation exists, creating session`);
      } catch (err: unknown) {
        const apiError = err as { status?: number };
        if (apiError.status === 404) {
          // Conversation doesn't exist
          console.warn(
            `[ApiClientV2] Conversation ${conversationId} doesn't exist, using temporary session`
          );
          const tempId = `temp-${Date.now()}`;
          this.sessions.set(conversationId, tempId);
          return tempId;
        }
        // Other errors - continue with session creation anyway
      }

      // Create a new session
      const response = await this.fetchJson<{ status: string; session_id: string }>(
        `${this.baseUrl}/api/v2/conversations/${conversationId}/session`,
        {
          method: 'POST',
        }
      );

      // Store the session ID
      const sessionId = response.session_id;
      console.log(`[ApiClientV2] Created new session: ${sessionId}`);
      this.sessions.set(conversationId, sessionId);
      return sessionId;
    } catch (error) {
      console.error(`[ApiClientV2] Error creating session:`, error);

      // Generate and store a fallback session ID
      const fallbackId = `fallback-${Date.now()}`;
      console.log(`[ApiClientV2] Using fallback session ID: ${fallbackId}`);
      this.sessions.set(conversationId, fallbackId);
      return fallbackId;
    }
  }

  // V2 API: Event Stream
  subscribeToEvents(
    conversationId: string,
    callbacks: {
      onToken?: (token: string) => void;
      onComplete?: (message: Message) => void;
      onUserMessageAdded?: (message: Message) => void;
      onToolPending?: (toolId: string, tool: string, args: string[], content: string) => void;
      onToolOutput?: (message: Message) => void;
      onError?: (error: string) => void;
    }
  ): void {
    // Get the session ID
    this.createOrGetSession(conversationId)
      .then((sessionId) => {
        // Close any existing event stream for this conversation
        this.closeEventStream(conversationId);

        // Create a new event stream
        const url = `${this.baseUrl}/api/v2/conversations/${conversationId}/events?session_id=${sessionId}`;
        console.log(`[ApiClientV2] Connecting to event stream: ${url}`);
        const eventSource = new EventSource(url);

        // Add connect event notification
        let isConnected = false;

        // Track reconnection attempts
        let reconnectCount = 0;
        const maxReconnects = 5;
        let reconnectTimer: number | null = null;

        // Handle connection open
        eventSource.onopen = () => {
          console.log(`[ApiClientV2] Event stream connected for ${conversationId}`);
          isConnected = true;
          reconnectCount = 0; // Reset reconnect count on successful connection
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Skip logging pings to avoid console spam
            if (data.type !== 'ping') {
              console.log(`[ApiClientV2] Event received:`, data);
            }

            switch (data.type) {
              case 'message_added':
                console.log(`[ApiClientV2] Message added:`, data.message);
                // Only handle user messages, as assistant messages come via other events
                if (data.message.role === 'user') {
                  callbacks.onUserMessageAdded?.(data.message);
                }
                break;

              case 'generation_progress':
                callbacks.onToken?.(data.token);
                break;

              case 'generation_complete':
                console.log(`[ApiClientV2] Generation complete:`, data.message);
                callbacks.onComplete?.(data.message);
                break;

              case 'tool_pending':
                console.log(`[ApiClientV2] Tool pending:`, data);
                // Flag message_persisted indicates the server has already persisted the assistant message
                if (data.message_persisted) {
                  console.log(`[ApiClientV2] Tool pending - message already persisted by server`);
                }
                callbacks.onToolPending?.(data.tool_id, data.tool, data.args, data.content);
                break;

              case 'tool_output': {
                console.log(`[ApiClientV2] Tool output received:`, data);

                // Create a properly formatted message from the direct fields
                const message = {
                  role: data.role || 'system',
                  content: data.content || '[No content]',
                  timestamp: data.timestamp || new Date().toISOString(),
                  id: `tool-output-${Date.now()}`,
                };

                console.log(`[ApiClientV2] Passing tool output message to handler:`, message);
                callbacks.onToolOutput?.(message);
                break;
              }

              case 'tool_executing':
                console.log(`[ApiClientV2] Tool executing:`, data);
                break;

              case 'tool_skipped':
                console.log(`[ApiClientV2] Tool skipped:`, data);
                break;

              case 'error':
                console.error(`[ApiClientV2] Error event:`, data);
                callbacks.onError?.(data.error);
                break;

              case 'generation_resuming':
                console.log(`[ApiClientV2] Generation resuming`);
                break;

              case 'ping':
                // Just a keep-alive, don't log to avoid spam
                break;

              case 'connected':
                console.log(`[ApiClientV2] Session connected event:`, data);
                break;

              default:
                console.log(`[ApiClientV2] Unknown event type:`, data);
                break;
            }
          } catch (e) {
            console.error('Error parsing event data:', e);
          }
        };

        eventSource.onerror = (error) => {
          console.error(`[ApiClientV2] Event stream error for ${conversationId}:`, error);

          // If we were previously connected, try to reconnect
          if (isConnected) {
            console.log(
              `[ApiClientV2] Connection was established before, attempting to reconnect...`
            );
            isConnected = false;

            // Only auto-reconnect if we haven't exceeded the max reconnects
            if (reconnectCount < maxReconnects) {
              reconnectCount++;

              // Exponential backoff for reconnection (1s, 2s, 4s, 8s, 16s)
              const delay = Math.pow(2, reconnectCount - 1) * 1000;

              console.log(
                `[ApiClientV2] Reconnecting in ${delay}ms (attempt ${reconnectCount}/${maxReconnects})`
              );

              // Clear any existing timer
              if (reconnectTimer !== null) {
                window.clearTimeout(reconnectTimer);
              }

              // Set a new timer for reconnection
              reconnectTimer = window.setTimeout(() => {
                console.log(`[ApiClientV2] Attempting reconnection for ${conversationId}`);
                this.closeEventStream(conversationId);
                this.subscribeToEvents(conversationId, callbacks);
              }, delay);
            } else {
              console.warn(`[ApiClientV2] Max reconnects (${maxReconnects}) reached, giving up`);
              callbacks.onError?.('Connection lost and max reconnects reached');
            }
          } else {
            // We never established a connection, report the error
            callbacks.onError?.('Failed to connect to event stream');
          }
        };

        // Store the event source
        this.eventSources.set(conversationId, eventSource);
      })
      .catch((error) => {
        console.error('Error creating or getting session:', error);
        callbacks.onError?.(error.message || 'Failed to create or get session');
      });
  }

  closeEventStream(conversationId: string): void {
    if (this.eventSources.has(conversationId)) {
      this.eventSources.get(conversationId)!.close();
      this.eventSources.delete(conversationId);
    }
  }

  // V2 API: Conversations
  async getConversations(
    limit: number = 100
  ): Promise<{ name: string; modified: number; messages: number }[]> {
    if (!this._isConnected) {
      throw new ApiClientError('Not connected to API');
    }
    try {
      return await this.fetchJson<{ name: string; modified: number; messages: number }[]>(
        `${this.baseUrl}/api/v2/conversations?limit=${limit}`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiClientError('Request aborted', 499);
      }
      throw error;
    }
  }

  async getConversation(logfile: string): Promise<ConversationResponse> {
    if (!this._isConnected) {
      throw new ApiClientError('Not connected to API');
    }
    try {
      const response = await this.fetchJson<ConversationResponse>(
        `${this.baseUrl}/api/v2/conversations/${logfile}`,
        {
          signal: this.controller?.signal,
        }
      );
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiClientError('Request aborted', 499);
      }
      throw error;
    }
  }

  async createConversation(
    logfile: string,
    messages: Message[]
  ): Promise<{ status: string; session_id: string }> {
    if (!this._isConnected) {
      console.error('Attempted to create conversation while disconnected');
      throw new ApiClientError('Not connected to API');
    }
    try {
      const request: CreateConversationRequest = { messages };
      const response = await this.fetchJson<{
        status: string;
        session_id: string;
        conversation_id: string;
      }>(`${this.baseUrl}/api/v2/conversations/${logfile}`, {
        method: 'PUT',
        body: JSON.stringify(request),
      });

      // Store the session ID
      this.sessions.set(logfile, response.session_id);
      console.log(
        `[ApiClientV2] Stored session ID from createConversation: ${response.session_id}`
      );

      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiClientError('Request aborted', 499);
      }
      console.error('Create conversation error:', error);
      throw error;
    }
  }

  async sendMessage(logfile: string, message: Message, branch: string = 'main'): Promise<void> {
    if (!this._isConnected) {
      throw new ApiClientError('Not connected to API');
    }
    try {
      const request: SendMessageRequest = { ...message, branch };
      await this.fetchJson<{ status: string }>(`${this.baseUrl}/api/v2/conversations/${logfile}`, {
        method: 'POST',
        body: JSON.stringify(request),
        signal: this.controller?.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiClientError('Request aborted', 499);
      }
      throw error;
    }
  }

  // V2 API: Generation and Tool Confirmation
  async generateResponse(
    logfile: string,
    callbacks: {
      onToken?: (token: string) => void;
      onComplete?: (message: Message) => void;
      onUserMessageAdded?: (message: Message) => void;
      onToolPending?: (toolId: string, tool: string, args: string[], content: string) => void;
      onToolOutput?: (message: Message) => void;
      onError?: (error: string) => void;
    },
    model?: string,
    branch: string = 'main'
  ): Promise<void> {
    if (!this._isConnected) {
      throw new Error('Not connected to API');
    }

    await this.cancelPendingRequests();

    // Create new controller for this request
    this.controller = new AbortController();

    try {
      // Subscribe to events for this conversation
      this.subscribeToEvents(logfile, callbacks);

      // Get or create a session
      const sessionId = await this.createOrGetSession(logfile);
      console.log(`[ApiClientV2] Using session ID for generation: ${sessionId}`);

      // Start generation
      await this.fetchJson<{ status: string; message: string; session_id: string }>(
        `${this.baseUrl}/api/v2/conversations/${logfile}/generate`,
        {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId, model, branch }),
          signal: this.controller.signal,
        }
      );
    } catch (error) {
      if (this.controller?.signal.aborted) {
        console.log('Generation request aborted');
        return;
      }
      throw error;
    }
  }

  async confirmTool(
    logfile: string,
    toolId: string,
    action: 'confirm' | 'edit' | 'skip' | 'auto',
    options?: {
      content?: string;
      count?: number;
    }
  ): Promise<void> {
    if (!this._isConnected) {
      throw new ApiClientError('Not connected to API');
    }

    console.log(`[ApiClientV2] Confirming tool: ${toolId}, action: ${action}`);

    try {
      // Get the session ID
      console.log(`[ApiClientV2] Getting session for tool confirmation`);
      const sessionId = await this.createOrGetSession(logfile);
      console.log(`[ApiClientV2] Using session for tool confirmation: ${sessionId}`);

      const request: ToolConfirmationRequest = {
        session_id: sessionId,
        tool_id: toolId,
        action,
      };

      if (action === 'edit' && options?.content) {
        request.content = options.content;
      } else if (action === 'auto' && options?.count) {
        request.count = options.count;
      }

      console.log(`[ApiClientV2] Sending tool confirmation request:`, request);

      await this.fetchJson<{ status: string }>(
        `${this.baseUrl}/api/v2/conversations/${logfile}/tool/confirm`,
        {
          method: 'POST',
          body: JSON.stringify(request),
          signal: this.controller?.signal,
        }
      );

      console.log(`[ApiClientV2] Tool confirmation successful`);
    } catch (error) {
      console.error(`[ApiClientV2] Tool confirmation failed:`, error);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiClientError('Request aborted', 499);
      }
      throw error;
    }
  }

  async interruptGeneration(logfile: string): Promise<void> {
    if (!this._isConnected) {
      throw new ApiClientError('Not connected to API');
    }

    try {
      // Get the session ID
      const sessionId = await this.createOrGetSession(logfile);

      await this.fetchJson<{ status: string }>(
        `${this.baseUrl}/api/v2/conversations/${logfile}/interrupt`,
        {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId }),
          signal: this.controller?.signal,
        }
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiClientError('Request aborted', 499);
      }
      throw error;
    }
  }
}

export const createApiClientV2 = (baseUrl?: string): ApiClientV2 => {
  return new ApiClientV2(baseUrl);
};
