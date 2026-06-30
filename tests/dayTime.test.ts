import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareByDayDesc,
  formatRelativeDay,
  startOfLocalDay,
} from '../src/utils/dayTime';

describe('dayTime', () => {
  it('startOfLocalDay returns midnight local time', () => {
    const noon = new Date(2026, 5, 30, 15, 30, 45, 123).getTime();
    const start = startOfLocalDay(noon);
    const date = new Date(start);
    assert.equal(date.getHours(), 0);
    assert.equal(date.getMinutes(), 0);
    assert.equal(date.getSeconds(), 0);
    assert.equal(date.getMilliseconds(), 0);
  });

  it('compareByDayDesc orders newer days first', () => {
    const today = startOfLocalDay(Date.now());
    const yesterday = today - 86_400_000;
    assert.ok(compareByDayDesc(yesterday, today) > 0);
    assert.ok(compareByDayDesc(today, yesterday) < 0);
  });

  it('compareByDayDesc returns 0 for same day', () => {
    const day = startOfLocalDay(Date.now());
    assert.equal(compareByDayDesc(day + 1000, day + 5000), 0);
  });

  it('formatRelativeDay returns hoje for today', () => {
    assert.equal(formatRelativeDay(Date.now()), 'hoje');
  });

  it('formatRelativeDay returns ontem for yesterday', () => {
    const yesterday = startOfLocalDay(Date.now()) - 86_400_000 + 12 * 3_600_000;
    assert.equal(formatRelativeDay(yesterday), 'ontem');
  });

  it('formatRelativeDay returns há N d for older days', () => {
    const threeDaysAgo = startOfLocalDay(Date.now()) - 3 * 86_400_000;
    assert.equal(formatRelativeDay(threeDaysAgo), 'há 3 d');
  });
});
