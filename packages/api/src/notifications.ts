import { z } from 'zod';

export const AlertChannel = z.enum(['email', 'sms', 'push']);
export type AlertChannel = z.infer<typeof AlertChannel>;

export const NotificationPrefs = z.object({
  alertChannel: AlertChannel.default('email'),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export function getAlertChannel(raw: unknown): AlertChannel {
  const result = NotificationPrefs.safeParse(raw);
  return result.success ? result.data.alertChannel : 'email';
}
