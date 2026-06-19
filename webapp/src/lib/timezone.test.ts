import { describe, it, expect } from 'vitest';
import {
  monthGrid,
  cellKey,
  localDateKey,
  localWindowForGrid,
  itemDayKey,
  itemHourInTz,
  nowInTz,
  parseUTC,
} from './timezone';

/** Weekday (0=Sun) of a grid cell, read via UTC. */
const dow = (c: { y: number; m: number; d: number }) =>
  new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay();

describe('monthGrid', () => {
  // June 2026: Jun 1 is a Monday, Jun 19 is a Friday (the project "today").
  it('builds a Sunday-started 5-week grid for June 2026', () => {
    const cells = monthGrid(2026, 6);
    expect(cells.length).toBe(35);
    expect(dow(cells[0])).toBe(0); // first cell is a Sunday
    // Spill-in from May, then Jun 1 in-month, then spill-out into July.
    expect(cells[0]).toEqual({ y: 2026, m: 5, d: 31, inMonth: false });
    expect(cells[1]).toEqual({ y: 2026, m: 6, d: 1, inMonth: true });
    expect(cells[34]).toEqual({ y: 2026, m: 7, d: 4, inMonth: false });
  });

  it('includes every day of the month exactly once', () => {
    const inMonth = monthGrid(2026, 6).filter((c) => c.inMonth);
    expect(inMonth.length).toBe(30); // June has 30 days
    expect(inMonth.map((c) => c.d)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('expands to a 6-week grid when the month spills into a 6th row (May 2026)', () => {
    const cells = monthGrid(2026, 5); // May 1 2026 is a Friday, 31 days
    expect(cells.length).toBe(42);
    expect(dow(cells[0])).toBe(0);
    expect(cells.filter((c) => c.inMonth).length).toBe(31);
  });

  it('handles a December → January year boundary', () => {
    const cells = monthGrid(2025, 12);
    const last = cells.filter((c) => c.inMonth).at(-1);
    expect(last).toEqual({ y: 2025, m: 12, d: 31, inMonth: true });
    // Spill-out cells belong to January 2026.
    expect(cells.some((c) => c.m === 1 && c.y === 2026 && !c.inMonth)).toBe(true);
  });
});

describe('localWindowForGrid', () => {
  it('spans the first and last visible cells', () => {
    expect(localWindowForGrid(monthGrid(2026, 6))).toEqual({ from: '2026-05-31', to: '2026-07-04' });
  });
});

describe('cellKey / localDateKey', () => {
  it('zero-pads month and day', () => {
    expect(cellKey({ y: 2026, m: 6, d: 5, inMonth: true })).toBe('2026-06-05');
    expect(localDateKey(new Date(Date.UTC(2026, 0, 9)))).toBe('2026-01-09');
  });
});

describe('itemDayKey — bucketing across offset midnight', () => {
  const lateNight = '2026-06-19T22:30:00.000Z';
  it('rolls forward a day for positive offsets past midnight', () => {
    expect(itemDayKey(lateNight, 'UTC+2')).toBe('2026-06-20'); // 00:30 local
    expect(itemDayKey(lateNight, 'UTC')).toBe('2026-06-19');
    expect(itemDayKey(lateNight, 'UTC-5:30')).toBe('2026-06-19'); // 17:00 local
  });

  const earlyMorning = '2026-06-19T01:00:00.000Z';
  it('rolls back a day for negative offsets before midnight', () => {
    expect(itemDayKey(earlyMorning, 'UTC-5:30')).toBe('2026-06-18'); // 19:30 prev day
    expect(itemDayKey(earlyMorning, 'UTC+2')).toBe('2026-06-19'); // 03:00 local
  });

  it('accepts the SQLite space form used by published_at', () => {
    expect(itemDayKey('2026-06-19 22:30:00', 'UTC+2')).toBe('2026-06-20');
  });
});

describe('itemHourInTz', () => {
  it('returns the wall-clock hour in the offset', () => {
    expect(itemHourInTz('2026-06-19T22:30:00Z', 'UTC+2')).toBe(0); // 00:30
    expect(itemHourInTz('2026-06-19T22:30:00Z', 'UTC')).toBe(22);
    expect(itemHourInTz('2026-06-19T22:30:00Z', 'UTC-5:30')).toBe(17);
  });
});

describe('nowInTz', () => {
  it('shifts a fixed instant into the offset wall-clock', () => {
    const fixed = new Date('2026-06-19T23:00:00Z');
    expect(localDateKey(nowInTz('UTC+2', fixed))).toBe('2026-06-20'); // 01:00 next day
    expect(localDateKey(nowInTz('UTC-5:30', fixed))).toBe('2026-06-19'); // 17:30 same day
  });
});

describe('parseUTC', () => {
  it('treats the space form and the T/Z form as the same UTC instant', () => {
    expect(parseUTC('2026-06-19 12:30:00').getTime()).toBe(parseUTC('2026-06-19T12:30:00Z').getTime());
  });
});
