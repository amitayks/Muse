import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X, AtSign, Camera, MonitorPlay, Clapperboard, Briefcase, Plus, Minus, Check } from 'lucide-react';
import { useTranslation } from '../i18n';
import {
  applyOffset,
  parseUTC,
  nowInTz,
  monthGrid,
  cellKey,
  localDateKey,
  localWindowForGrid,
  itemDayKey,
  itemHourInTz,
  type DayCell,
} from '../lib/timezone';
import { useCalendar } from '../hooks/useCalendar';
import type { CalendarItem, CalendarTargets } from '../types/calendar';
import { haptics } from '../shell';
import styles from './ScheduleCalendar.module.css';

/**
 * Calendar-based schedule picker. Replaces the day-chip + clock `ScheduleSheet`.
 *
 * Month view (density grid) → day view (24-hour ruler with posts pinned to their hour) → tap an
 * empty hour to select it, fine-tune the minutes, confirm. Past published posts and future
 * scheduled posts render as read-only context (the full content calendar); only the draft being
 * scheduled is actionable.
 *
 * Like `ScheduleSheet`, it emits a wall-clock `"YYYY-MM-DDTHH:mm"` string in the user's configured
 * timezone (`tz`) — the bot converts to UTC server-side, so we never apply the device timezone.
 * Mount it only while open so its state initializes fresh each time.
 */
interface ScheduleCalendarProps {
  /** User's configured offset, e.g. 'UTC+2'. */
  tz: string;
  busy?: boolean;
  /** ISO-UTC current slot when rescheduling — opens on that month/day, highlighted. */
  currentScheduledAt?: string | null;
  /** Id of the draft being scheduled — its own calendar item is shown as "current", not a conflict. */
  currentDraftId?: string | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

export function ScheduleCalendar({
  tz, busy, currentScheduledAt, currentDraftId, onConfirm, onCancel,
}: ScheduleCalendarProps) {
  const { t } = useTranslation();

  // "Now" in the user's tz: a Date whose UTC fields equal the tz wall-clock.
  const nowLocal = useMemo(() => nowInTz(tz), [tz]);
  const todayKey = useMemo(() => localDateKey(nowLocal), [nowLocal]);
  const currentKey = useMemo(
    () => (currentScheduledAt ? itemDayKey(currentScheduledAt, tz) : null),
    [currentScheduledAt, tz],
  );

  // Open on the rescheduled slot's month, else the current month (in the user's tz).
  const initialMonth = useMemo(() => {
    const base = currentScheduledAt ? applyOffset(parseUTC(currentScheduledAt), tz) : nowLocal;
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1 };
  }, [currentScheduledAt, tz, nowLocal]);

  const [visible, setVisible] = useState(initialMonth);
  const [view, setView] = useState<'month' | 'day'>('month');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(currentKey);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState(0);

  const cells = useMemo(() => monthGrid(visible.y, visible.m), [visible]);
  const window = useMemo(() => localWindowForGrid(cells), [cells]);
  const { items } = useCalendar(window.from, window.to);

  // Bucket items by their day in the user's offset.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const key = itemDayKey(it.at, tz);
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return map;
  }, [items, tz]);

  const weekdayLabels = useMemo(
    () =>
      cells.slice(0, 7).map((c) =>
        new Date(Date.UTC(c.y, c.m - 1, c.d, 12)).toLocaleDateString(undefined, {
          weekday: 'short',
          timeZone: 'UTC',
        }),
      ),
    [cells],
  );

  const monthLabel = useMemo(
    () =>
      new Date(Date.UTC(visible.y, visible.m - 1, 1)).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [visible],
  );

  const stepMonth = (delta: number) => {
    haptics.selectionChanged();
    setVisible((v) => {
      const idx = (v.m - 1) + delta;
      return { y: v.y + Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 + 1 };
    });
  };

  const openDay = (cell: DayCell) => {
    haptics.selectionChanged();
    const key = cellKey(cell);
    setSelectedDayKey(key);
    // Reschedule: landing on the current slot's day preselects its time.
    if (currentScheduledAt && key === currentKey) {
      const local = applyOffset(parseUTC(currentScheduledAt), tz);
      setSelectedHour(local.getUTCHours());
      setSelectedMinute(local.getUTCMinutes());
    } else {
      setSelectedHour(null);
      setSelectedMinute(0);
    }
    setView('day');
  };

  const cancel = () => {
    haptics.selectionChanged();
    onCancel();
  };

  return (
    <div className={styles.backdrop} onClick={cancel} role="presentation">
      <div
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('composer.schedule')}
      >
        <div className={styles.grabber} />
        {view === 'month' ? (
          <MonthView
            monthLabel={monthLabel}
            weekdayLabels={weekdayLabels}
            cells={cells}
            byDay={byDay}
            todayKey={todayKey}
            currentKey={currentKey}
            onPrev={() => stepMonth(-1)}
            onNext={() => stepMonth(1)}
            onClose={cancel}
            onPick={openDay}
          />
        ) : (
          <DayView
            dayKey={selectedDayKey!}
            tz={tz}
            nowLocal={nowLocal}
            todayKey={todayKey}
            items={(byDay.get(selectedDayKey!) ?? []).filter((it) => it.draftId !== currentDraftId)}
            selectedHour={selectedHour}
            selectedMinute={selectedMinute}
            busy={busy}
            onBack={() => { haptics.selectionChanged(); setView('month'); }}
            onClose={cancel}
            onSelectHour={(h) => { haptics.selectionChanged(); setSelectedHour(h); setSelectedMinute(0); }}
            onStepMinute={(delta) =>
              setSelectedMinute((m) => (((m + delta) % 60) + 60) % 60)
            }
            onConfirm={() => {
              if (selectedHour === null) return;
              const { y, m, d } = parseDayKey(selectedDayKey!);
              haptics.notification('success');
              onConfirm(`${y}-${pad(m)}-${pad(d)}T${pad(selectedHour)}:${pad(selectedMinute)}`);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Month view
 * ------------------------------------------------------------------ */

interface MonthViewProps {
  monthLabel: string;
  weekdayLabels: string[];
  cells: DayCell[];
  byDay: Map<string, CalendarItem[]>;
  todayKey: string;
  currentKey: string | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onPick: (cell: DayCell) => void;
}

function MonthView({
  monthLabel, weekdayLabels, cells, byDay, todayKey, currentKey, onPrev, onNext, onClose, onPick,
}: MonthViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className={styles.header}>
        <button type="button" className={styles.navBtn} onClick={onPrev} aria-label={t('calendar.prevMonth')}>
          <ChevronLeft size={20} />
        </button>
        <h2 className={styles.monthTitle}>{monthLabel}</h2>
        <button type="button" className={styles.navBtn} onClick={onNext} aria-label={t('calendar.nextMonth')}>
          <ChevronRight size={20} />
        </button>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.cancel')}>
          <X size={20} />
        </button>
      </div>

      <div className={styles.weekdays}>
        {weekdayLabels.map((w, i) => (
          <span key={i} className={styles.weekday}>{w}</span>
        ))}
      </div>

      <div className={styles.grid}>
        {cells.map((cell) => {
          const key = cellKey(cell);
          const dayItems = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isCurrent = key === currentKey;
          return (
            <button
              key={key}
              type="button"
              className={styles.dayCell}
              data-out={!cell.inMonth || undefined}
              data-today={isToday || undefined}
              data-current={isCurrent || undefined}
              onClick={() => onPick(cell)}
            >
              <span className={styles.dayNum}>{cell.d}</span>
              {dayItems.length > 0 && (
                <span className={styles.dots}>
                  {dayItems.slice(0, 3).map((it) => (
                    <span key={it.id} className={styles.dot} data-kind={it.kind} />
                  ))}
                  {dayItems.length > 3 && <span className={styles.more}>+{dayItems.length - 3}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Day view — 24-hour ruler
 * ------------------------------------------------------------------ */

interface DayViewProps {
  dayKey: string;
  tz: string;
  nowLocal: Date;
  todayKey: string;
  items: CalendarItem[];
  selectedHour: number | null;
  selectedMinute: number;
  busy?: boolean;
  onBack: () => void;
  onClose: () => void;
  onSelectHour: (h: number) => void;
  onStepMinute: (delta: number) => void;
  onConfirm: () => void;
}

function DayView({
  dayKey, tz, nowLocal, todayKey, items, selectedHour, selectedMinute, busy,
  onBack, onClose, onSelectHour, onStepMinute, onConfirm,
}: DayViewProps) {
  const { t } = useTranslation();
  const { y, m, d } = parseDayKey(dayKey);

  const isToday = dayKey === todayKey;
  const isPastDay = dayKey < todayKey;

  const dayTitle = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  });

  // Group items into their hour rows once.
  const byHour = useMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const it of items) {
      const h = itemHourInTz(it.at, tz);
      const arr = map.get(h);
      if (arr) arr.push(it);
      else map.set(h, [it]);
    }
    return map;
  }, [items, tz]);

  const isPastHour = (h: number) => isPastDay || (isToday && h < nowLocal.getUTCHours());

  // Auto-scroll to the most relevant hour when the day opens.
  const scrollTargetHour = useMemo(() => {
    if (selectedHour !== null) return selectedHour;
    if (isToday) return nowLocal.getUTCHours();
    const firstWithPost = HOURS.find((h) => byHour.has(h));
    return firstWithPost ?? 8;
  }, [selectedHour, isToday, nowLocal, byHour]);

  const targetRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Scroll the relevant hour into view whenever the day changes (ref-only; no extra deps).
    targetRowRef.current?.scrollIntoView({ block: 'center' });
  }, [dayKey]);

  // Selected wall-clock as as-if-UTC ms, comparable to nowLocal.getTime() (also as-if-UTC).
  const isPast =
    selectedHour !== null && Date.UTC(y, m - 1, d, selectedHour, selectedMinute) <= nowLocal.getTime();

  return (
    <>
      <div className={styles.header}>
        <button type="button" className={styles.navBtn} onClick={onBack} aria-label={t('common.back')}>
          <ChevronLeft size={20} />
        </button>
        <h2 className={styles.monthTitle}>{dayTitle}</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('common.cancel')}>
          <X size={20} />
        </button>
      </div>

      <div className={styles.ruler}>
        {HOURS.map((h) => {
          const hourItems = byHour.get(h) ?? [];
          const past = isPastHour(h);
          const selected = selectedHour === h;
          return (
            <div
              key={h}
              ref={h === scrollTargetHour ? targetRowRef : undefined}
              className={styles.hourRow}
              data-past={past || undefined}
              data-selected={selected || undefined}
              role={past ? undefined : 'button'}
              tabIndex={past ? undefined : 0}
              onClick={past ? undefined : () => onSelectHour(h)}
              onKeyDown={past ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectHour(h); } }}
            >
              <span className={styles.hourLabel}>{pad(h)}:00</span>
              <div className={styles.hourBody}>
                {hourItems.map((it) => (
                  <PostChip key={it.id} item={it} tz={tz} />
                ))}
                {!past && hourItems.length === 0 && !selected && (
                  <span className={styles.addHint}><Plus size={14} /> {t('calendar.tapToAdd')}</span>
                )}
                {selected && (
                  <span className={styles.selectedSlot}>{pad(h)}:{pad(selectedMinute)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedHour !== null && (
        <div className={styles.confirmBar}>
          <div className={styles.fineTune}>
            <button type="button" className={styles.stepBtn} onClick={() => onStepMinute(-5)} aria-label={t('calendar.minuteDown')}>
              <Minus size={16} />
            </button>
            <span className={styles.selectedTime}>{pad(selectedHour)}:{pad(selectedMinute)}</span>
            <button type="button" className={styles.stepBtn} onClick={() => onStepMinute(5)} aria-label={t('calendar.minuteUp')}>
              <Plus size={16} />
            </button>
          </div>
          <button
            type="button"
            className={styles.setBtn}
            onClick={onConfirm}
            disabled={isPast || busy}
          >
            <Check size={16} /> {t('calendar.set')}
          </button>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Post chip (read-only context — scheduled or published)
 * ------------------------------------------------------------------ */

const ICON_SIZE = 14;

function PlatformIcons({ targets }: { targets: CalendarTargets }) {
  const icons: ReactNode[] = [];
  if (targets.x) icons.push(<AtSign key="x" size={ICON_SIZE} aria-label="X" />);
  if (targets.instagram_post) icons.push(<Camera key="ig" size={ICON_SIZE} aria-label="Instagram" />);
  if (targets.instagram_story) icons.push(<MonitorPlay key="igs" size={ICON_SIZE} aria-label="Instagram Story" />);
  if (targets.instagram_reel) icons.push(<Clapperboard key="igr" size={ICON_SIZE} aria-label="Instagram Reel" />);
  if (targets.linkedin) icons.push(<Briefcase key="li" size={ICON_SIZE} aria-label="LinkedIn" />);
  if (icons.length === 0) return null;
  return <span className={styles.platforms}>{icons}</span>;
}

function PostChip({ item, tz }: { item: CalendarItem; tz: string }) {
  const time = applyOffset(parseUTC(item.at), tz).toLocaleTimeString(undefined, {
    timeZone: 'UTC', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className={styles.chip} data-kind={item.kind}>
      <span className={styles.chipTime}>{time}</span>
      <span className={styles.chipTitle}>{item.title || item.firstTweet}</span>
      <PlatformIcons targets={item.targets} />
    </div>
  );
}
