import { z } from 'zod';

export const AlertChannel = z.enum(['email', 'sms', 'push']);
export type AlertChannel = z.infer<typeof AlertChannel>;

export const NotificationPrefs = z.object({
  alertChannels: z.array(AlertChannel).min(1).default(['email']),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export function getAlertChannels(raw: unknown): AlertChannel[] {
  const result = NotificationPrefs.safeParse(raw);
  return result.success ? result.data.alertChannels : ['email'];
}
