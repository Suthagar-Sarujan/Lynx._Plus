import test from 'node:test';
import assert from 'node:assert/strict';
import { headlineSimilarity, isDuplicateHeadline } from '@/application/util/headlines';
import { matchesAnyKeyword } from '@/application/util/keywords';
import { decodeEntities } from '@/infrastructure/feeds/htmlEntities';
import { effectivePhotoWidth, isWithinActiveHours } from '@/application/use-cases/RunAutopilot';

test('same event worded differently is a duplicate; different events are not', () => {
  const a = 'Sri Lanka cabinet approves new fuel price formula';
  assert.ok(headlineSimilarity(a, 'Cabinet approves new fuel pricing formula in Sri Lanka') >= 0.55);
  assert.equal(isDuplicateHeadline('Fire breaks out at Colombo market', [a]), false);
  assert.equal(isDuplicateHeadline(a, []), false);
});

test('keywords match whole words and plurals only', () => {
  assert.equal(matchesAnyKeyword('Grape harvest rises', ['rape']), false);
  assert.equal(matchesAnyKeyword('Weather warning issued', ['war']), false);
  assert.equal(matchesAnyKeyword("Why traders want Rahul's rally postponed", ['rally']), true);
  assert.equal(matchesAnyKeyword('Elections announced', ['election']), true);
  assert.equal(matchesAnyKeyword('anything', ['', '  ']), false);
});

test('html entities decode, including double-encoded ones', () => {
  assert.equal(decodeEntities('Sri Lanka&#8217;s LAUGFS'), 'Sri Lanka’s LAUGFS');
  assert.equal(decodeEntities('Tom &amp; Jerry &quot;x&quot; &#x2019;'), 'Tom & Jerry "x" ’');
  assert.equal(decodeEntities('A&amp;#8217;B'), 'A’B');
  assert.equal(decodeEntities('plain &unknown; text'), 'plain &unknown; text');
});

test('effective photo width accounts for the portrait crop', () => {
  assert.equal(Math.round(effectivePhotoWidth({ width: 1200, height: 675 })), 608); // 16:9 loses width
  assert.equal(effectivePhotoWidth({ width: 800, height: 2000 }), 800); // tall photo keeps full width
});

test('active hours respect the timezone and wrap past midnight', () => {
  const s = { activeFromHour: 7, activeToHour: 23, timezone: 'Asia/Colombo' };
  assert.equal(isWithinActiveHours(s, new Date('2026-10-27T03:00:00Z')), true); // 08:30 local
  assert.equal(isWithinActiveHours(s, new Date('2026-10-27T20:00:00Z')), false); // 01:30 local
  const night = { activeFromHour: 22, activeToHour: 6, timezone: 'UTC' };
  assert.equal(isWithinActiveHours(night, new Date('2026-10-27T23:00:00Z')), true);
  assert.equal(isWithinActiveHours(night, new Date('2026-10-27T12:00:00Z')), false);
  assert.equal(isWithinActiveHours({ activeFromHour: 0, activeToHour: 0, timezone: 'UTC' }, new Date()), true);
});
