/**
 * A debounced save that reads the value to persist at FIRE time, never at schedule time.
 *
 * This backs the composer's content/text auto-save. Reading the value lazily at fire time means a
 * save armed by one keystroke persists the LATEST editor buffer when it lands, not a stale snapshot.
 *
 * Media is no longer part of the content payload (the server owns draft media and mutates it only
 * through the dedicated atomic endpoints), so this saver no longer needs to "stand down" while an
 * image generates — a media-less text save can never clobber server-held media. It is therefore a
 * plain debounce: no blocking / retry dance.
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
  /** Produce the value to persist — read LAZILY at fire time so it reflects the latest state. */
  getValue: () => T;
  /** Persist the value. */
  save: (value: T) => void;
}

export function createDeferredSave<T>(cfg: DeferredSaveConfig<T>): DeferredSave {
  const delayMs = cfg.delayMs ?? 700;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
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
