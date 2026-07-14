import * as assert from 'assert';
import { formatLocalDate, formatLocalTime, TimeFormatter } from '../time';

describe('TimeFormatter', () => {
    const formatter = new TimeFormatter();

    it('formats durations longer than 24 hours', () => {
        assert.strictEqual(formatter.formatDuration(27 * 3_600_000 + 5 * 60_000 + 9_000), '27:05:09');
    });

    it('never formats a negative duration', () => {
        assert.strictEqual(formatter.formatDuration(-5_000), '00:00:00');
    });

    it('parses a valid duration and rejects invalid values', () => {
        assert.strictEqual(formatter.parseDuration('01:02:03'), 3_723_000);
        assert.strictEqual(formatter.parseDuration('broken'), 0);
    });
});

describe('local date helpers', () => {
    const date = new Date(2026, 6, 15, 9, 8, 7);

    it('uses stable sortable date and time formats', () => {
        assert.strictEqual(formatLocalDate(date), '2026-07-15');
        assert.strictEqual(formatLocalTime(date), '09:08:07');
    });
});
