/**
 * Regression test for the atomic per-tweet media append.
 *
 * Exercises the EXACT production statement (`APPEND_TWEET_MEDIA_SQL` + `tweetMediaPath`, imported
 * from the shared module so the test can never drift from `appendTweetMedia`) against an in-memory
 * SQLite via Node's built-in `node:sqlite` — no dependencies, no D1 mock.
 *
 * Guards the property that caused the production bug: each append reads-and-writes the media array
 * inside ONE statement, so sequential appends targeting different tweets all survive (the previous
 * read-whole-content / write-whole-content cycle dropped media when two generations raced). D1
 * serializes writes, so the single-statement append is the concurrency fix; this test pins the SQL
 * idiom's correctness (append-not-replace, empty-array seeding, ownership scoping).
 *
 * Run: `npm test` (in cloudflare-bot) — Node strips the TS types.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { APPEND_TWEET_MEDIA_SQL, tweetMediaPath } from '../src/data/append-tweet-media-sql.ts';

type Media = { key: string; type: 'photo' | 'video' };

function freshDb(tweets: Array<{ text: string; media?: Media[] }>) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE drafts (id TEXT, chat_id TEXT, content TEXT, updated_at TEXT)');
  db.prepare('INSERT INTO drafts (id, chat_id, content, updated_at) VALUES (?, ?, ?, ?)')
    .run('draft-1', 'chat-1', JSON.stringify({ format: 'thread', tweets }), '');
  return db;
}

function append(db: DatabaseSync, tweetIndex: number, media: Media, id = 'draft-1', chatId = 'chat-1') {
  const path = tweetMediaPath(tweetIndex);
  const info = db.prepare(APPEND_TWEET_MEDIA_SQL).run(path, path, JSON.stringify(media), id, chatId);
  return info.changes;
}

function mediaOf(db: DatabaseSync, id = 'draft-1') {
  const row = db.prepare('SELECT content FROM drafts WHERE id = ?').get(id) as { content: string };
  return (JSON.parse(row.content).tweets as Array<{ media?: Media[] }>).map((t) => t.media ?? null);
}

test('append creates the array on a tweet that has no media', () => {
  const db = freshDb([{ text: 't0' }, { text: 't1' }]);
  assert.equal(append(db, 0, { key: 'a', type: 'photo' }), 1);
  assert.deepEqual(mediaOf(db), [[{ key: 'a', type: 'photo' }], null]);
});

test('append adds to existing media (does not replace)', () => {
  const db = freshDb([{ text: 't0', media: [{ key: 'a', type: 'photo' }] }]);
  assert.equal(append(db, 0, { key: 'b', type: 'photo' }), 1);
  assert.deepEqual(mediaOf(db), [[{ key: 'a', type: 'photo' }, { key: 'b', type: 'photo' }]]);
});

test('sequential appends on different tweets all survive (the race regression)', () => {
  // This is the exact shape of the production failure: 4 tweets, an image generated for each.
  // With the old read-modify-write, a later write based on a stale snapshot erased an earlier
  // tweet's media (prod showed tweets[2].media = null). One-statement appends compose correctly.
  const db = freshDb([{ text: 't0' }, { text: 't1' }, { text: 't2' }, { text: 't3' }]);
  append(db, 0, { key: 'k0', type: 'photo' });
  append(db, 1, { key: 'k1', type: 'photo' });
  append(db, 2, { key: 'k2', type: 'photo' });
  append(db, 3, { key: 'k3', type: 'photo' });
  assert.deepEqual(mediaOf(db), [
    [{ key: 'k0', type: 'photo' }],
    [{ key: 'k1', type: 'photo' }],
    [{ key: 'k2', type: 'photo' }],
    [{ key: 'k3', type: 'photo' }],
  ]);
});

test('append is scoped by ownership (wrong chat_id changes nothing)', () => {
  const db = freshDb([{ text: 't0' }]);
  assert.equal(append(db, 0, { key: 'x', type: 'photo' }, 'draft-1', 'WRONG'), 0);
  assert.deepEqual(mediaOf(db), [null]);
});

test('the media is stored as a JSON object, not an escaped string', () => {
  const db = freshDb([{ text: 't0' }]);
  append(db, 0, { key: 'a', type: 'photo' });
  const row = db.prepare('SELECT content FROM drafts WHERE id = ?').get('draft-1') as { content: string };
  // If json(?) were omitted, media[0] would be the string "{\"key\":\"a\",...}" instead of an object.
  const m = JSON.parse(row.content).tweets[0].media[0];
  assert.equal(typeof m, 'object');
  assert.equal(m.key, 'a');
  assert.equal(m.type, 'photo');
});
