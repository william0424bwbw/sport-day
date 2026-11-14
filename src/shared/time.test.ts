import { describe, expect, it } from 'vitest';
import { clampToDay, formatRange, minToTime, snapToStep, timeOptions, timeToMin } from './time';

describe('time', () => {
  it('分鐘與 HH:MM 互轉', () => {
    expect(minToTime(540)).toBe('09:00');
    expect(minToTime(605)).toBe('10:05');
    expect(timeToMin('09:00')).toBe(540);
    expect(timeToMin('7:30')).toBe(450);
    expect(timeToMin('25:00')).toBeNull();
    expect(timeToMin('abc')).toBeNull();
  });
  it('時間範圍與網格', () => {
    expect(formatRange(540, 610)).toBe('09:00–10:10');
    expect(snapToStep(544)).toBe(540);
    expect(snapToStep(546)).toBe(550);
    expect(clampToDay(300)).toBe(420);
    expect(clampToDay(1100)).toBe(1020);
    const opts = timeOptions();
    expect(opts[0]).toEqual({ value: 420, label: '07:00' });
    expect(opts.at(-1)).toEqual({ value: 1020, label: '17:00' });
  });
});
