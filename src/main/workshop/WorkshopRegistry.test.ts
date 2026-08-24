import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WorkshopRegistry,
  type WorkshopRegistryRevision,
} from './WorkshopRegistry';

let rootDirectory = '';
let registryPath = '';
let clock = 1_786_000_000_000;

const now = (): Date => new Date(clock += 1_000);

const revision = (version: string, hashCharacter: string): WorkshopRegistryRevision => ({
  contentId: 'echo.registry-fixture',
  contentKind: 'theme',
  version,
  manifestSha256: hashCharacter.repeat(64),
  directory: join(rootDirectory, 'items', version),
  installedAt: now().toISOString(),
});

beforeEach(async () => {
  rootDirectory = await mkdtemp(join(tmpdir(), 'echo-workshop-registry-'));
  registryPath = join(rootDirectory, 'workshop', 'registry.json');
  clock = 1_786_000_000_000;
});

afterEach(async () => {
  await rm(rootDirectory, { recursive: true, force: true });
});

describe('WorkshopRegistry', () => {
  it('persists detected items disabled by default through an explicit state machine', () => {
    const registry = new WorkshopRegistry({ filePath: registryPath, now });
    expect(registry.registerDetected('steam', '123')).toMatchObject({ state: 'detected', activeRevision: null });
    registry.transition('steam', '123', 'verified');
    registry.transition('steam', '123', 'staged', { candidateRevision: revision('1.0.0', 'a') });
    registry.transition('steam', '123', 'disabled');
    const enabled = registry.transition('steam', '123', 'enabled');

    expect(enabled.activeRevision).toMatchObject({ version: '1.0.0' });
    expect(new WorkshopRegistry({ filePath: registryPath }).get('steam', '123')).toEqual(enabled);
    expect(JSON.parse(readFileSync(registryPath, 'utf8'))).toMatchObject({ formatVersion: 1, revision: 5 });
  });

  it('retains the previous active revision as last-known-good across an update', () => {
    const registry = new WorkshopRegistry({ filePath: registryPath, now });
    registry.registerDetected('steam', '123');
    registry.transition('steam', '123', 'verified');
    registry.transition('steam', '123', 'staged', { candidateRevision: revision('1.0.0', 'a') });
    registry.transition('steam', '123', 'disabled');
    registry.transition('steam', '123', 'enabled');
    registry.transition('steam', '123', 'downloading');
    registry.transition('steam', '123', 'verified');
    registry.transition('steam', '123', 'staged', { candidateRevision: revision('2.0.0', 'b') });
    registry.transition('steam', '123', 'disabled');
    const updated = registry.transition('steam', '123', 'enabled');

    expect(updated.activeRevision).toMatchObject({ version: '2.0.0' });
    expect(updated.lastKnownGoodRevision).toMatchObject({ version: '1.0.0' });

    const rolledBack = registry.rollbackToLastKnownGood('steam', '123');
    expect(rolledBack).toMatchObject({ state: 'disabled', activeRevision: null });
    expect(rolledBack.candidateRevision).toMatchObject({ version: '1.0.0' });
    expect(rolledBack.lastKnownGoodRevision).toMatchObject({ version: '2.0.0' });
    expect(rolledBack.approvedCapabilities).toEqual([]);
  });

  it('rejects invalid transitions without mutating persisted state', () => {
    const registry = new WorkshopRegistry({ filePath: registryPath, now });
    registry.registerDetected('steam', '123');
    const before = registry.getSnapshot();

    expect(() => registry.transition('steam', '123', 'enabled')).toThrow(
      'workshop_registry_transition_invalid:detected:enabled',
    );
    expect(registry.getSnapshot()).toEqual(before);
  });

  it('preserves an unreadable registry instead of overwriting it', () => {
    mkdirSync(join(rootDirectory, 'workshop'), { recursive: true });
    writeFileSync(registryPath, '{broken json', { encoding: 'utf8', flag: 'w' });
    const registry = new WorkshopRegistry({ filePath: registryPath, now });

    expect(registry.getHealth()).toEqual({ writable: false, error: 'registry-unreadable' });
    expect(() => registry.registerDetected('steam', '123')).toThrow('workshop_registry_unreadable');
    expect(readFileSync(registryPath, 'utf8')).toBe('{broken json');
  });

  it('stores approved capabilities separately from enabled state', () => {
    const registry = new WorkshopRegistry({ filePath: registryPath, now });
    registry.registerDetected('local', '123');
    const updated = registry.setApprovedCapabilities('local', '123', ['playback:read', 'network']);

    expect(updated.state).toBe('detected');
    expect(updated.approvedCapabilities).toEqual(['playback:read', 'network']);
  });
});
