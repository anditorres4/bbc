import * as Haptics from 'expo-haptics'

export async function playSuccess(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}

export async function playError(): Promise<void> {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
}
