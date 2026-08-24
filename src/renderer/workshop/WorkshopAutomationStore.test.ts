// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readWorkshopAutomationRules, workshopAutomationsChangedEvent, writeWorkshopAutomationRules } from './WorkshopAutomationStore';

describe('WorkshopAutomationStore', () => {
  beforeEach(() => window.localStorage.clear());

  it('normalizes, persists, and broadcasts bounded rules', () => {
    const changed = vi.fn();
    window.addEventListener(workshopAutomationsChangedEvent, changed);
    const rules = writeWorkshopAutomationRules([{
      id: 'rule-1', title: '开始播放时运行', enabled: true, trigger: 'track-started', intervalMinutes: 99,
      sourceId: 'steam', itemId: '123', pluginId: 'echo.tools', targetKind: 'command', targetId: 'refresh',
      agentPrompt: 'ignored', cooldownSeconds: 2,
    }]);
    expect(rules[0]).toMatchObject({ intervalMinutes: null, agentPrompt: null });
    expect(readWorkshopAutomationRules()).toEqual(rules);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('clamps timer intervals and rejects incomplete rules', () => {
    const rules = writeWorkshopAutomationRules([{
      id: 'timer', title: 'Timer', enabled: true, trigger: 'timer', intervalMinutes: 0,
      sourceId: 'steam', itemId: '123', pluginId: 'echo.tools', targetKind: 'agent', targetId: 'helper',
      agentPrompt: 'Run a summary', cooldownSeconds: -5,
    }, {} as never]);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ intervalMinutes: 1, cooldownSeconds: 0, agentPrompt: 'Run a summary' });
  });
});

