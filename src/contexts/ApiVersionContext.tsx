import { createContext, useContext, useState, type ReactNode, useEffect } from 'react';

type ApiVersion = 'v1' | 'v2';

interface ApiVersionContextType {
  apiVersion: ApiVersion;
  setApiVersion: (version: ApiVersion) => void;
  isV2Available: boolean;
}

const ApiVersionContext = createContext<ApiVersionContextType | null>(null);

const API_VERSION_STORAGE_KEY = 'gptme-api-version';

export function ApiVersionProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage if available, default to v1
  const [apiVersion, setApiVersionState] = useState<ApiVersion>(() => {
    const savedVersion = localStorage.getItem(API_VERSION_STORAGE_KEY);
    return (savedVersion === 'v2' ? 'v2' : 'v1') as ApiVersion;
  });

  // Track if V2 API is available
  const [isV2Available, setIsV2Available] = useState<boolean>(false);

  // Check if V2 API is available on the server
  useEffect(() => {
    const checkV2Availability = async () => {
      try {
        const response = await fetch('http://127.0.0.1:5000/api/v2');
        setIsV2Available(response.ok);

        // If V2 is not available but was selected, fallback to V1
        if (!response.ok && apiVersion === 'v2') {
          console.warn('V2 API not available, falling back to V1');
          setApiVersionState('v1');
          localStorage.setItem(API_VERSION_STORAGE_KEY, 'v1');
        }
      } catch (error) {
        console.warn('V2 API not available:', error);
        setIsV2Available(false);

        // If user had selected V2 but it's not available, fallback to V1
        if (apiVersion === 'v2') {
          setApiVersionState('v1');
          localStorage.setItem(API_VERSION_STORAGE_KEY, 'v1');
        }
      }
    };

    checkV2Availability();
  }, [apiVersion]);

  // Update localStorage when API version changes
  const setApiVersion = (version: ApiVersion) => {
    // Only allow switching to V2 if it's available
    if (version === 'v2' && !isV2Available) {
      console.warn('V2 API not available, staying on V1');
      return;
    }

    setApiVersionState(version);
    localStorage.setItem(API_VERSION_STORAGE_KEY, version);
  };

  return (
    <ApiVersionContext.Provider value={{ apiVersion, setApiVersion, isV2Available }}>
      {children}
    </ApiVersionContext.Provider>
  );
}

export function useApiVersion() {
  const context = useContext(ApiVersionContext);
  if (!context) {
    throw new Error('useApiVersion must be used within an ApiVersionProvider');
  }
  return context;
}
