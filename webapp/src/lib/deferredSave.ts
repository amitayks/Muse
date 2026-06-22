/**
 * A debounced save that (a) reads the value to persist at FIRE time, never at schedule time, and
 * (b) stands down while a blocking operation is in flight.
 *
 * This backs the composer's content auto-save. The two properties together close the secondary
 * media-loss path behind the per-tweet image bug: while an image is generating the server is
 * appending media out-of-band, so a full-content PUT must not fire; and when it does fire it must
 * use the LATEST editor buffer (which by then includes the generated media), not a stale snapshot
 * captured when the user's keystroke armed the timer.
 *
 * Framework-agnostic and pure (only timers) so it can be unit-tested with fake timers.
 */
export interface DeferredSave {
  /** (Re)arm the debounce. Calling again before it fires resets the delay. */
  schedule(): void;
  /** Cancel any pending save (e.g. on unmount). */
  cancel(): void;
}

export interface DeferredSaveConfig<T> {
  /** Debounce window before a save fires. Default 700ms. */
  delayMs?: number;
  /** While blocked, how often to re-check before firing. Default 300ms. */
  retryMs?: number;
  /** True while a save must be withheld (e.g. an image generation is in flight). */
  isBlocked: () => boolean;
  /** Produce the value to persist — read LAZILY at fire time so it reflects the latest state. */
  getValue: () => T;
  /** Persist the value. */
  save: (value: T) => void;
}

export function createDeferredSave<T>(cfg: DeferredSaveConfig<T>): DeferredSave {
  const delayMs = cfg.delayMs ?? 700;
  const retryMs = cfg.retryMs ?? 300;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    if (cfg.isBlocked()) {
      // Defer: re-arm and try again shortly, so the save lands only after the block clears.
      timer = setTimeout(fire, retryMs);
      return;
    }
    timer = null;
    cfg.save(cfg.getValue());
  };

  return {
    schedule(): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, delayMs);
    },
    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
