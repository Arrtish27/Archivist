import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '@/ui/theme';

import {
  AppServices,
  getAppServices,
  resetAppServicesForRetry,
} from './AppServices';

type AppServicesState =
  | {
      status: 'loading';
    }
  | {
      services: AppServices;
      status: 'ready';
    }
  | {
      error: Error;
      retry: () => void;
      status: 'error';
    };

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppServicesState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    resetAppServicesForRetry();
    setState({ status: 'loading' });
    setRetryToken((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    getAppServices()
      .then((services) => {
        if (!cancelled) {
          setState({ services, status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            error: error instanceof Error ? error : new Error(String(error)),
            retry,
            status: 'error',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retry, retryToken]);

  const contextValue = useMemo(
    () => (state.status === 'ready' ? state.services : null),
    [state],
  );

  if (state.status === 'loading') {
    return <StartupStateScreen message="Preparing local data" />;
  }

  if (state.status === 'error') {
    return (
      <StartupStateScreen
        actionLabel="Retry"
        message="Local data could not start"
        onAction={state.retry}
        supportingText={state.error.message}
      />
    );
  }

  return (
    <AppServicesContext.Provider value={contextValue}>
      {children}
    </AppServicesContext.Provider>
  );
}

export function useAppServices() {
  const services = useContext(AppServicesContext);

  if (!services) {
    throw new Error('App services are not ready.');
  }

  return services;
}

function StartupStateScreen({
  actionLabel,
  message,
  onAction,
  supportingText,
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  supportingText?: string;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.title}>{message}</Text>
        {supportingText ? (
          <Text style={styles.supportingText}>{supportingText}</Text>
        ) : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.button}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  panel: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 20,
    width: '100%',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  supportingText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
});
