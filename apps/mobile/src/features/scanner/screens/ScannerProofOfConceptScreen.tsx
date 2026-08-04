import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppServices } from '@/app/AppServicesProvider';
import { ScanCandidate } from '@/domain/card-resolution/types';
import { StillImageOcrResult } from '@/features/scanner/NativeOcrService';
import { theme } from '@/ui/theme';

type CaptureState =
  | {
      status: 'idle';
    }
  | {
      status: 'capturing';
    }
  | {
      candidates: ScanCandidate[];
      ocr: StillImageOcrResult;
      status: 'complete';
    }
  | {
      message: string;
      status: 'failed';
    };

export function ScannerProofOfConceptScreen() {
  const services = useAppServices();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureState>({
    status: 'idle',
  });

  async function captureAndRecognize() {
    if (!cameraRef.current || captureState.status === 'capturing') {
      return;
    }

    setCaptureState({ status: 'capturing' });

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        skipProcessing: false,
      });

      const ocr = await services.ocr.recognizeStillImage(photo.uri);
      const candidates = await services.scanner.resolveText({
        footerText: ocr.lines
          .slice(-3)
          .map((line) => line.text)
          .join(' '),
        nameText: ocr.lines[0]?.text ?? ocr.rawText,
      });

      setCaptureState({
        candidates,
        ocr,
        status: 'complete',
      });
    } catch (error) {
      setCaptureState({
        message: error instanceof Error ? error.message : String(error),
        status: 'failed',
      });
    }
  }

  if (!permission) {
    return <ScannerStateScreen message="Checking camera permission" />;
  }

  if (!permission.granted) {
    return (
      <ScannerStateScreen
        actionLabel="Allow Camera"
        message="Camera access is optional"
        onAction={requestPermission}
        supportingText="Manual deck entry and local search stay available if camera access is denied."
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.screen}
      testID="scanner-poc"
    >
      <View style={styles.cameraPanel}>
        <CameraView
          active
          facing="back"
          mode="picture"
          onCameraReady={() => setCameraReady(true)}
          ref={cameraRef}
          style={styles.camera}
        />
        <View pointerEvents="none" style={styles.guideFrame}>
          <View style={styles.guideInset} />
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          disabled={!cameraReady || captureState.status === 'capturing'}
          onPress={captureAndRecognize}
          style={[
            styles.primaryButton,
            (!cameraReady || captureState.status === 'capturing') &&
              styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {captureState.status === 'capturing'
              ? 'Processing'
              : 'Capture OCR Still'}
          </Text>
        </Pressable>
      </View>

      <ScannerResultPanel state={captureState} />

      <StatusBar style="light" />
    </ScrollView>
  );
}

function ScannerResultPanel({ state }: { state: CaptureState }) {
  if (state.status === 'idle') {
    return (
      <View style={styles.resultPanel}>
        <Text style={styles.panelTitle}>Still Image OCR</Text>
        <Text style={styles.panelText}>
          Align one card, capture a still, and the native OCR bridge will feed
          text into the offline resolver.
        </Text>
      </View>
    );
  }

  if (state.status === 'capturing') {
    return (
      <View style={styles.resultPanel}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.panelText}>Processing captured image.</Text>
      </View>
    );
  }

  if (state.status === 'failed') {
    return (
      <View style={[styles.resultPanel, styles.resultPanelWarning]}>
        <Text style={styles.panelTitle}>OCR unavailable</Text>
        <Text style={styles.panelText}>{state.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.resultPanel}>
      <Text style={styles.panelTitle}>OCR Result</Text>
      <Text style={styles.panelMeta}>
        {state.ocr.blockCount} text blocks, {state.ocr.lines.length} lines
      </Text>
      <Text style={styles.ocrText}>
        {state.ocr.rawText || 'No text recognized.'}
      </Text>

      <Text style={styles.panelTitle}>Resolver Candidates</Text>
      {state.candidates.length ? (
        state.candidates.map((candidate) => (
          <View key={candidate.cardUuid} style={styles.candidateRow}>
            <Text style={styles.candidateTitle}>{candidate.cardName}</Text>
            <Text style={styles.panelMeta}>
              {Math.round(candidate.confidence * 100)} percent confidence
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.panelText}>No local catalog match yet.</Text>
      )}
    </View>
  );
}

function ScannerStateScreen({
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
    <View style={styles.stateScreen}>
      <View style={styles.resultPanel}>
        <Text style={styles.panelTitle}>{message}</Text>
        {supportingText ? (
          <Text style={styles.panelText}>{supportingText}</Text>
        ) : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
  cameraPanel: {
    aspectRatio: 3 / 4,
    backgroundColor: theme.colors.text,
    borderRadius: 8,
    overflow: 'hidden',
  },
  candidateRow: {
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  candidateTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 36,
  },
  controls: {
    gap: 12,
  },
  guideFrame: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  guideInset: {
    aspectRatio: 2.5 / 3.5,
    borderColor: theme.colors.surface,
    borderRadius: 8,
    borderWidth: 2,
    opacity: 0.9,
    width: '74%',
  },
  ocrText: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
  },
  panelMeta: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  panelText: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: theme.colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  resultPanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  resultPanelWarning: {
    borderColor: theme.colors.warning,
  },
  screen: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  stateScreen: {
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
