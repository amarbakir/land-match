import { Modal, Pressable, View } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface DeleteProfileModalProps {
  profileName: string;
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteProfileModal({
  profileName,
  visible,
  onConfirm,
  onCancel,
}: DeleteProfileModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <YStack
          backgroundColor={colors.cardBackground}
          borderWidth={1}
          borderColor={colors.border}
          borderRadius={12}
          padding={24}
          width={360}
          gap={16}
        >
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            Delete profile?
          </Text>
          <Text fontSize={13} color={colors.textSecondary}>
            "{profileName}" and all its matches will be permanently deleted.
            This cannot be undone.
          </Text>
          <XStack justifyContent="flex-end" gap={10} marginTop={8}>
            <Pressable onPress={onCancel}>
              <Text
                fontSize={13}
                fontWeight="500"
                color={colors.textSecondary}
                paddingVertical={8}
                paddingHorizontal={16}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{
                backgroundColor: colors.dangerBgStrong,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
                borderRadius: 6,
                paddingVertical: 8,
                paddingHorizontal: 16,
              }}
            >
              <Text fontSize={13} fontWeight="600" color={colors.danger}>
                Delete
              </Text>
            </Pressable>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
}
