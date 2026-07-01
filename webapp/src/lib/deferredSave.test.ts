import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeferredSave } from './deferredSave';

/**
 * The content/text auto-save is a plain debounce that reads the latest buffer at FIRE time.
 * Media is no longer carried in the content payload (the server owns it via dedicated endpoints),
 * so the old "stand down while generating" guard is gone — these tests pin the two properties that
 * remain: (1) the save reads the latest value when it lands, and (2) cancel() prevents a fire.
 */
describe('createDeferredSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('persists the LATEST value at fire time, not the value when scheduled', () => {
    let buffer = 'edit-1';
    const save = vi.fn();
    const saver = createDeferredSave({
      delayMs: 700,
      getValue: () => buffer,
      save,
    });

    saver.schedule(); // armed while buffer === 'edit-1'
    buffer = 'edit-2'; // user keeps typing before the debounce elapses
    vi.advanceTimersByTime(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('edit-2');
  });

  it('re-arming before the debounce elapses coalesces to a single save', () => {
    const save = vi.fn();
    const saver = createDeferredSave({ delayMs: 700, getValue: () => 'v', save });

    saver.schedule();
    vi.advanceTimersByTime(400);
    saver.schedule(); // resets the timer
    vi.advanceTimersByTime(400); // 800ms since first schedule, but only 400ms since the last
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300); // 700ms since the last schedule → fires once
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents a pending save from firing', () => {
    const save = vi.fn();
    const saver = createDeferredSave({ delayMs: 700, getValue: () => 'v', save });
    saver.schedule();
    saver.cancel();
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });
});
