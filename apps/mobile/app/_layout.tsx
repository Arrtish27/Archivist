import { Stack } from 'expo-router';

import { AppProviders } from '../src/app/providers';
import { theme } from '../src/ui/theme';

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: {
            color: theme.colors.text,
            fontSize: 18,
            fontWeight: '700',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Grand Archive Companion',
          }}
        />
      </Stack>
    </AppProviders>
  );
}
