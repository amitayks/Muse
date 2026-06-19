import { useCallback, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import styles from './ClockTimePicker.module.css';

/**
 * Material-style "clock" time picker (à la the Google phone clock): a circular dial where you
 * tap or drag to pick the hour, then it advances to minutes. 12-hour with an AM/PM toggle.
 *
 * Controlled component: `hour` is 0–23, `minute` is 0–59. Times are timezone-agnostic here —
 * the parent decides what timezone the wall-clock represents.
 */
interface ClockTimePickerProps {
  /** 0–23 */
  hour: number;
  /** 0–59 */
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

type Mode = 'hours' | 'minutes';

const TWO_PI = Math.PI * 2;
const VB = 256; // svg viewBox size
const C = VB / 2; // center
const R_NUM = 94; // radius of the number ring
const R_SEL = 22; // selector-circle radius

function to12(h24: number): { h12: number; pm: boolean } {
  const pm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h12, pm };
}

function from12(h12: number, pm: boolean): number {
  return (h12 % 12) + (pm ? 12 : 0);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function ClockTimePicker({ hour, minute, onChange }: ClockTimePickerProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('hours');
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const { h12, pm } = to12(hour);

  // Angle (radians, clockwise from 12 o'clock) of the currently selected value.
  const activeAngle =
    mode === 'hours' ? (h12 % 12) * (TWO_PI / 12) : minute * (TWO_PI / 60);
  const selX = C + R_NUM * Math.sin(activeAngle);
  const selY = C - R_NUM * Math.cos(activeAngle);

  // Map a pointer position on the dial to a value and emit it.
  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>, release: boolean) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // client px → viewBox units (the svg scales to fit its box)
      const x = ((e.clientX - rect.left) / rect.width) * VB;
      const y = ((e.clientY - rect.top) / rect.height) * VB;
      let a = Math.atan2(y - C, x - C) + Math.PI / 2; // clockwise from top
      if (a < 0) a += TWO_PI;

      if (mode === 'hours') {
        const idx = Math.round(a / (TWO_PI / 12)) % 12; // 0 == 12 o'clock
        const newH12 = idx === 0 ? 12 : idx;
        onChange(from12(newH12, pm), minute);
        if (release) setMode('minutes'); // Material: tap an hour → jump to minutes
      } else {
        const m = Math.round(a / (TWO_PI / 60)) % 60;
        onChange(hour, m);
      }
    },
    [mode, pm, hour, minute, onChange],
  );

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    handlePointer(e, false);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging.current) handlePointer(e, false);
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    svgRef.current?.releasePointerCapture(e.pointerId);
    handlePointer(e, true);
  };

  // Keyboard support for the slider: arrows step the focused value (hours wrap 1–12, minutes 0–59).
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -1;
    else return;
    e.preventDefault();
    if (mode === 'hours') {
      const next = (((h12 % 12) + delta + 12) % 12);
      onChange(from12(next === 0 ? 12 : next, pm), minute);
    } else {
      onChange(hour, (minute + delta + 60) % 60);
    }
  };

  // Numbers around the ring: hours 1..12 (12 at top), minutes 00,05,…,55.
  const numbers =
    mode === 'hours'
      ? Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), pos: (i + 1) % 12, value: i + 1 }))
      : Array.from({ length: 12 }, (_, i) => ({ label: pad(i * 5), pos: i, value: i * 5 }));

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.timeField}
          data-active={mode === 'hours'}
          onClick={() => setMode('hours')}
          aria-label={t('composer.hour')}
        >
          {pad(h12)}
        </button>
        <span className={styles.colon}>:</span>
        <button
          type="button"
          className={styles.timeField}
          data-active={mode === 'minutes'}
          onClick={() => setMode('minutes')}
          aria-label={t('composer.minute')}
        >
          {pad(minute)}
        </button>
        <div className={styles.ampm}>
          <button
            type="button"
            className={styles.ampmBtn}
            data-active={!pm}
            onClick={() => onChange(from12(h12, false), minute)}
          >
            AM
          </button>
          <button
            type="button"
            className={styles.ampmBtn}
            data-active={pm}
            onClick={() => onChange(from12(h12, true), minute)}
          >
            PM
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className={styles.dial}
        viewBox={`0 0 ${VB} ${VB}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="slider"
        aria-label={mode === 'hours' ? t('composer.hour') : t('composer.minute')}
        aria-valuemin={mode === 'hours' ? 1 : 0}
        aria-valuemax={mode === 'hours' ? 12 : 59}
        aria-valuenow={mode === 'hours' ? h12 : minute}
        aria-valuetext={mode === 'hours' ? `${h12} ${pm ? 'PM' : 'AM'}` : pad(minute)}
      >
        <circle cx={C} cy={C} r={C} className={styles.face} />
        <line x1={C} y1={C} x2={selX} y2={selY} className={styles.hand} />
        <circle cx={selX} cy={selY} r={R_SEL} className={styles.selector} />
        <circle cx={C} cy={C} r={3.5} className={styles.hub} />
        {/* off-tick minute (not a multiple of 5): mark the exact spot with a small dot */}
        {mode === 'minutes' && minute % 5 !== 0 && (
          <circle cx={selX} cy={selY} r={2} className={styles.minuteDot} />
        )}
        {numbers.map(({ label, pos, value }) => {
          const ang = pos * (TWO_PI / 12);
          const nx = C + R_NUM * Math.sin(ang);
          const ny = C - R_NUM * Math.cos(ang);
          const isActive = mode === 'hours' ? value === h12 : value === minute;
          return (
            <text
              key={label}
              x={nx}
              y={ny}
              className={styles.num}
              data-active={isActive}
              dominantBaseline="central"
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
