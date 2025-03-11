import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { createApiClientV2 } from '@/utils/apiV2';
import type { ApiClientV2 } from '@/utils/apiV2';
import type { QueryClient } from '@tanstack/react-query';

interface ApiContextType {
  api: ApiClientV2;
  isConnected: boolean;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  // Methods from ApiClientV2 that are used in components
  getConversation: ApiClientV2['getConversation'];
  sendMessage: ApiClientV2['sendMessage'];
  generateResponse: ApiClientV2['generateResponse'];
  confirmTool: ApiClientV2['confirmTool']; // New method for tool confirmation
  interruptGeneration: ApiClientV2['interruptGeneration']; // New method for interruption
  cancelPendingRequests: ApiClientV2['cancelPendingRequests'];
  // Add event stream methods
  subscribeToEvents: ApiClientV2['subscribeToEvents'];
  closeEventStream: ApiClientV2['closeEventStream'];
}

const ApiContext = createContext<ApiContextType | null>(null);

export function ApiProvider({
  children,
  initialBaseUrl,
  queryClient,
}: {
  children: ReactNode;
  initialBaseUrl: string;
  queryClient: QueryClient;
}) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [api, setApi] = useState(() => createApiClientV2(initialBaseUrl));
  const [isConnected, setIsConnected] = useState(false);

  // Attempt initial connection
  useEffect(() => {
    const attemptInitialConnection = async () => {
      try {
        console.log('Attempting initial connection to:', baseUrl);
        const connected = await api.checkConnection();
        console.log('Initial connection result:', connected);
        if (connected) {
          setIsConnected(true);
          console.log('Successfully connected to API');
        } else {
          console.log('Failed to connect to API - server may be down');
        }
      } catch (error) {
        console.error('Initial connection attempt failed:', error);
        setIsConnected(false);
      }
    };

    void attemptInitialConnection();
  }, [api, baseUrl]);

  const updateBaseUrl = async (newUrl: string) => {
    try {
      setBaseUrl(newUrl);
      const newApi = createApiClientV2(newUrl);

      // Update connection status
      const connected = await newApi.checkConnection();
      if (!connected) {
        throw new Error('Failed to connect to API');
      }

      newApi.setConnected(true); // Explicitly set connection state
      setApi(newApi);
      setIsConnected(true);

      // Invalidate and refetch all queries
      await queryClient.invalidateQueries();
      await queryClient.refetchQueries({
        queryKey: ['conversations'],
        type: 'active',
      });
    } catch (error) {
      console.error('Failed to update API connection:', error);
      setIsConnected(false);
      throw error; // Re-throw to handle in the UI
    }
  };

  return (
    <ApiContext.Provider
      value={{
        api,
        isConnected,
        baseUrl,
        setBaseUrl: updateBaseUrl,
        // Forward methods from the API client
        getConversation: api.getConversation.bind(api),
        sendMessage: api.sendMessage.bind(api),
        generateResponse: api.generateResponse.bind(api),
        confirmTool: api.confirmTool.bind(api), // New method for tool confirmation
        interruptGeneration: api.interruptGeneration.bind(api), // New method for interruption
        cancelPendingRequests: api.cancelPendingRequests.bind(api),
        // Add event stream methods
        subscribeToEvents: api.subscribeToEvents.bind(api),
        closeEventStream: api.closeEventStream.bind(api),
      }}
    >
      {children}
    </ApiContext.Provider>
  );
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
}
