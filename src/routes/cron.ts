import { Hono } from 'hono';
import { checkFeedAndPost } from '../core/autopost';

export const cron = new Hono();

cron.post('/check-feed', async (c) => {
  try {
    const result = await checkFeedAndPost();
    return c.json({ status: 'success', ...result }, 200);
  } catch (err) {
    console.error('Cron job failed:', err);
    return c.json({ status: 'error' }, 500);
  }
});
