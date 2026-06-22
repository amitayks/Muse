import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeferredSave } from './deferredSave';

/**
 * These tests pin the two properties that close the auto-save media-clobber path behind the
 * per-tweet image generation bug: (1) the save reads the latest buffer at fire time, and (2) it
 * defers while a generation is in flight and only persists once it clears.
 */
describe('createDeferredSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('persists the LATEST value at fire time, not the value when scheduled', () => {
    let buffer = 'edit-1';
    const save = vi.fn();
    const saver = createDeferredSave({
      delayMs: 700,
      isBlocked: () => false,
      getValue: () => buffer,
      save,
    });

    saver.schedule(); // armed while buffer === 'edit-1'
    buffer = 'edit-2'; // user keeps typing before the debounce elapses
    vi.advanceTimersByTime(700);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('edit-2');
  });

  it('does not save while blocked, and saves after the block clears', () => {
    let blocked = true;
    const save = vi.fn();
    const saver = createDeferredSave({
      delayMs: 700,
      retryMs: 300,
      isBlocked: () => blocked,
      getValue: () => 'value',
      save,
    });

    saver.schedule();
    vi.advanceTimersByTime(700); // debounce elapses, but blocked → must defer
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300); // still blocked → still deferring
    expect(save).not.toHaveBeenCalled();

    blocked = false;
    vi.advanceTimersByTime(300); // next retry tick → now it fires
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('generation-vs-autosave: an edit during generation persists with the generated media, no clobber', () => {
    // Model the composer buffer as { text, media }. The user edits text, which arms the save.
    // Then a generation starts (blocked=true) and the server appends media to local state mid-flight.
    // When generation finishes, the deferred save must persist text + media together.
    const buffer: { text: string; media: string[] } = { text: 't', media: [] };
    let generating = false;
    const save = vi.fn();
    const saver = createDeferredSave({
      delayMs: 700,
      retryMs: 300,
      isBlocked: () => generating,
      getValue: () => structuredClone(buffer),
      save,
    });

    // 1. user edits text → arm the save
    buffer.text = 'tweet text edited';
    saver.schedule();

    // 2. generation starts before the debounce elapses
    generating = true;
    vi.advanceTimersByTime(700); // would-be save is deferred
    expect(save).not.toHaveBeenCalled();

    // 3. generation appends media to local editor state, then completes
    buffer.media.push('webapp/chat/generated.jpg');
    generating = false;
    vi.advanceTimersByTime(300);

    // 4. the save lands once, carrying BOTH the edit and the generated media
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ text: 'tweet text edited', media: ['webapp/chat/generated.jpg'] });
  });

  it('cancel() prevents a pending save from firing', () => {
    const save = vi.fn();
    const saver = createDeferredSave({ delayMs: 700, isBlocked: () => false, getValue: () => 'v', save });
    saver.schedule();
    saver.cancel();
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });
});
