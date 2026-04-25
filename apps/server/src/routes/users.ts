import { Hono } from 'hono';
import { NotificationPrefs } from '@landmatch/api';

import { badRequest, okResponse, throwFromResult } from '../lib/httpExceptions';
import * as userService from '../services/userService';
import type { Env } from '../types/env';

const users = new Hono<Env>();

users.get('/me/notification-preferences', async (c) => {
  const userId = c.get('userId');
  const result = await userService.getNotificationPrefs(userId);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404 });
  }

  return okResponse(c, result.data);
});

users.put('/me/notification-preferences', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = NotificationPrefs.safeParse(body);

  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const result = await userService.updateNotificationPrefs(userId, parsed.data);

  if (!result.ok) {
    return throwFromResult(result, { NOT_FOUND: 404 });
  }

  return okResponse(c, result.data);
});

export default users;
