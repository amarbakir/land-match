import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface ToastProps {
  message: string;
  variant?: 'success' | 'error';
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, variant = 'success', visible, onDismiss, duration = 2500 }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        onDismiss();
      });
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss, opacity]);

  if (!visible) return null;

  const bg = variant === 'error' ? colors.dangerBg : 'rgba(125,184,138,0.15)';
  const borderColor = variant === 'error' ? colors.dangerBorder : 'rgba(125,184,138,0.3)';
  const textColor = variant === 'error' ? colors.danger : colors.success;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 24,
        left: 0,
        right: 0,
        alignItems: 'center',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <XStack
        backgroundColor={bg}
        borderWidth={1}
        borderColor={borderColor}
        paddingHorizontal={16}
        paddingVertical={10}
        borderRadius={8}
      >
        <Text fontFamily="$mono" fontSize={12} color={textColor}>
          {message}
        </Text>
      </XStack>
    </Animated.View>
  );
}
