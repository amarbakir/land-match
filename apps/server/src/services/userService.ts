import { err, ok, type Result, NotificationPrefs, type NotificationPrefs as NotificationPrefsType } from '@landmatch/api';

import * as userRepo from '../repos/userRepo';

export async function getNotificationPrefs(userId: string): Promise<Result<NotificationPrefsType>> {
  try {
    const user = await userRepo.findById(userId);
    if (!user) return err('NOT_FOUND');

    const prefs = NotificationPrefs.parse(user.notificationPrefs ?? {});
    return ok(prefs);
  } catch (error) {
    console.error('[userService.getNotificationPrefs]', error);
    return err('INTERNAL_ERROR');
  }
}

export async function updateNotificationPrefs(
  userId: string,
  input: NotificationPrefsType,
): Promise<Result<NotificationPrefsType>> {
  try {
    const row = await userRepo.updateNotificationPrefs(userId, input);
    if (!row) return err('NOT_FOUND');

    return ok(input);
  } catch (error) {
    console.error('[userService.updateNotificationPrefs]', error);
    return err('INTERNAL_ERROR');
  }
}
