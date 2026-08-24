import { describe, expect, it } from 'vitest';
import { createSearchAliasLookup, matchesSearchFields, matchesSearchText, scoreSearchText } from './smartTextSearch';

describe('smartTextSearch', () => {
  it('does not treat a single han character as a pinyin-initial wildcard', () => {
    expect(matchesSearchText('我', '我的歌词页')).toBe(true);
    expect(matchesSearchText('我', '文字与样式')).toBe(false);
  });

  it('finds chinese titles by pinyin', () => {
    expect(matchesSearchText('wenzi', '文字与样式')).toBe(true);
    expect(matchesSearchText('waiguan', '外观')).toBe(true);
  });

  it('keeps short latin queries exact so eq does not match every word with e', () => {
    expect(matchesSearchText('eq', 'EQ 均衡器')).toBe(true);
    expect(matchesSearchText('eq', 'exclusive output')).toBe(false);
  });

  it('scores a title hit above a description hit', () => {
    const titleScore = scoreSearchText('buffer', 'Buffer and latency', { title: 'Buffer and latency' });
    const descriptionScore = scoreSearchText('buffer', 'Keep a larger buffer for stable playback');
    expect(titleScore).toBeGreaterThan(descriptionScore);
  });

  it('matches queued tracks by any listed field', () => {
    expect(matchesSearchFields('周杰', ['晴天', '周杰伦', '叶惠美'])).toBe(true);
    expect(matchesSearchFields('qingtian', ['晴天', '周杰伦'])).toBe(true);
    expect(matchesSearchFields('buffer', ['晴天', '周杰伦'])).toBe(false);
  });

  it('matches a multi-word query against a phrase in the haystack', () => {
    expect(matchesSearchText(
      'Spotify Client ID',
      'Spotify OAuth 配置 Spotify Client ID Spotify redirect URI Spotify API spotify client_id',
    )).toBe(true);
  });

  it('uses alias groups without merging unrelated words', () => {
    const aliasLookup = createSearchAliasLookup([
      ['buffer', 'latency', '缓冲'],
      ['lowload', '低负载', '卡顿'],
    ]);

    expect(matchesSearchText('卡顿', '低负载播放模式', { aliasLookup })).toBe(true);
    expect(matchesSearchText('卡顿', 'Buffer and latency', { aliasLookup })).toBe(false);
  });
});
