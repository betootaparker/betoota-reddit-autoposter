import { reddit, redis, context } from '@devvit/web/server';
import { XMLParser } from 'fast-xml-parser';

const RSS_FEED_URL = 'https://www.betootaadvocate.com/latest/rss/';
const MAX_POSTS_PER_RUN = 3;
const POSTED_IDS_KEY = 'autopost:posted-ids';

type FeedItem = {
  title: string;
  link: string;
  guid?: string;
};

async function fetchFeedItems(): Promise<FeedItem[]> {
  const response = await fetch(RSS_FEED_URL);
  const xml = await response.text();

  const parser = new XMLParser();
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item ?? [];
  const itemArray = Array.isArray(items) ? items : [items];

  return itemArray
    .filter((item) => item && item.link)
    .map((item) => ({
      title: String(item.title ?? 'New post'),
      link: String(item.link),
      guid: item.guid ? String(item.guid) : undefined,
    }));
}

export async function checkFeedAndPost(): Promise<{ posted: number }> {
  const subredditName = context.subredditName;
  if (!subredditName) {
    console.error('No subredditName in context, cannot post.');
    return { posted: 0 };
  }

  const items = await fetchFeedItems();
  if (items.length === 0) {
    console.log('No items found in feed.');
    return { posted: 0 };
  }

  // Oldest first, so we post in chronological order
  const orderedItems = [...items].reverse();

  let postedCount = 0;

  for (const item of orderedItems) {
    if (postedCount >= MAX_POSTS_PER_RUN) {
      console.log(`Reached max posts per run (${MAX_POSTS_PER_RUN}), stopping.`);
      break;
    }

    const entryId = item.guid ?? item.link;

    const alreadyPosted = await redis.hGet(POSTED_IDS_KEY, entryId);
    if (alreadyPosted) {
      continue;
    }

    try {
      let title = item.title.trim();
      if (title.length > 300) {
        title = title.slice(0, 297) + '...';
      }

      await reddit.submitPost({
        subredditName,
        title,
        url: item.link,
      });

      await redis.hSet(POSTED_IDS_KEY, { [entryId]: new Date().toISOString() });
      postedCount++;
      console.log(`Posted: ${title} -> ${item.link}`);
    } catch (err) {
      console.error(`Failed to post "${item.title}":`, err);
    }
  }

  console.log(`Done. Posted ${postedCount} new item(s).`);
  return { posted: postedCount };
}
