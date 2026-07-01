/**
 * Shared SQL for the atomic per-tweet media append.
 *
 * Kept in its own dependency-free module so the production data layer (`draft-db.ts`) and the
 * standalone `node:sqlite` regression test exercise the EXACT same statement — no drift.
 *
 * The append is a single in-place JSON UPDATE, so the read of the current media and the write of
 * the appended result happen together inside one statement. D1/SQLite serializes writes, so two
 * overlapping image generations can't clobber each other (each appends to the other's committed
 * result). Bind order: (path, path, mediaJson, id, chatId).
 *
 * The JSON path is built in JS (`tweetMediaPath`) and bound as TEXT rather than concatenated from a
 * bound number inside SQL: a JS number bound as SQLite REAL would stringify to e.g. `1.0`, yielding
 * the invalid path `$.tweets[1.0].media`. Building the path in JS keeps the index an integer and
 * makes the binding unambiguous across D1 and node:sqlite.
 */

export const APPEND_TWEET_MEDIA_SQL = `UPDATE drafts
SET content = json_set(
        content,
        ?,
        json_insert(
            COALESCE(json_extract(content, ?), json('[]')),
            '$[#]',
            json(?)
        )
    ),
    updated_at = datetime('now')
WHERE id = ? AND chat_id = ?`;

/** JSON path to a tweet's media array, e.g. `$.tweets[2].media`. Index is forced to an integer. */
export function tweetMediaPath(tweetIndex: number): string {
    return `$.tweets[${Math.trunc(tweetIndex)}].media`;
}

/**
 * Replace ONE tweet's `media` array in place with a caller-computed value.
 *
 * ATOMICITY TRADE-OFF (see openspec `server-authoritative-media`, Decision 3): unlike the append
 * (`APPEND_TWEET_MEDIA_SQL`, a true single-statement read-and-write), `remove` and `retarget` are
 * read-modify-write of the ONE tweet's media array — the new array is computed in JS from a possibly
 * stale read, then written back. This statement only touches `$.tweets[N].media`, so a concurrent
 * append/edit to a DIFFERENT tweet is never clobbered; only two overlapping mutations of the SAME
 * tweet's media could lose one. That blast radius is acceptable (and far smaller than the full-content
 * clobber this change fixes): remove/retarget are rare, explicit, single-item user actions.
 *
 * Bind order: (path, mediaJson, id, chatId). `json(?)` stores the array as JSON, not an escaped string.
 */
export const SET_TWEET_MEDIA_SQL = `UPDATE drafts
SET content = json_set(content, ?, json(?)),
    updated_at = datetime('now')
WHERE id = ? AND chat_id = ?`;
