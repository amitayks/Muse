import { useMemo, useState } from 'react';
import { useTranslation } from '../i18n';
import { applyOffset } from '../lib/timezone';
import { haptics } from '../shell';
import { ClockTimePicker } from './ClockTimePicker';
import styles from './ScheduleSheet.module.css';

/**
 * Bottom-sheet schedule picker: a 7-day quick chooser (mirroring the bot's day picker) plus a
 * Material-style clock for the time. Mount it only while open (the parent gates with `&&`) so its
 * state initializes fresh each time.
 *
 * On confirm it emits a wall-clock `"YYYY-MM-DDTHH:mm"` string in the user's configured timezone
 * (`tz`). The bot converts that to UTC server-side — so we never apply the device timezone here.
 */
interface ScheduleSheetProps {
  /** User's configured offset, e.g. 'UTC+2'. */
  tz: string;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function ScheduleSheet({ tz, busy, onConfirm, onCancel }: ScheduleSheetProps) {
  const { t } = useTranslation();

  // "Now" in the user's tz: a Date whose UTC fields equal the tz wall-clock.
  const nowLocal = useMemo(() => applyOffset(new Date(), tz), [tz]);

  // 7-day window starting today, in the user's tz (same as the bot's renderScheduleDayPicker).
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(nowLocal.getTime() + i * DAY_MS);
        return {
          index: i,
          y: d.getUTCFullYear(),
          m: d.getUTCMonth() + 1,
          d: d.getUTCDate(),
          weekday: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
            .toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
        };
      }),
    [nowLocal],
  );

  // Default to the next o'clock; if that rolls past midnight, start on tomorrow so the initial
  // selection is always in the future (and the Schedule button is never dead on open).
  const nextHour = nowLocal.getUTCHours() + 1;
  const [dayIdx, setDayIdx] = useState(nextHour >= 24 ? 1 : 0);
  const [hour, setHour] = useState(nextHour % 24);
  const [minute, setMinute] = useState(0);

  const day = days[dayIdx];
  // Chosen wall-clock as as-if-UTC ms, comparable to nowLocal.getTime() (also as-if-UTC).
  const chosenMs = Date.UTC(day.y, day.m - 1, day.d, hour, minute);
  const isPast = chosenMs <= nowLocal.getTime();

  const dayLabel = (i: number, weekday: string, dd: number) => {
    if (i === 0) return t('time.today');
    if (i === 1) return t('time.tomorrow');
    return `${weekday} ${dd}`;
  };

  const confirm = () => {
    if (isPast || busy) return;
    haptics.notification('success');
    onConfirm(`${day.y}-${pad(day.m)}-${pad(day.d)}T${pad(hour)}:${pad(minute)}`);
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
        <h2 className={styles.title}>{t('composer.schedule')}</h2>

        <div className={styles.days}>
          {days.map((d) => (
            <button
              key={d.index}
              type="button"
              className={styles.dayChip}
              data-active={d.index === dayIdx}
              onClick={() => {
                haptics.selectionChanged();
                setDayIdx(d.index);
              }}
            >
              {dayLabel(d.index, d.weekday, d.d)}
            </button>
          ))}
        </div>

        <ClockTimePicker
          hour={hour}
          minute={minute}
          onChange={(h, m) => {
            setHour(h);
            setMinute(m);
          }}
        />

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={cancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={confirm}
            disabled={isPast || busy}
          >
            {t('composer.schedule')}
          </button>
        </div>
      </div>
    </div>
  );
}
