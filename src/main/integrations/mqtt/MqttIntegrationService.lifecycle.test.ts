import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: {
    mqttIntegrationEnabled: false,
    mqttBrokerUrl: 'mqtt://127.0.0.1:1883',
    mqttUsername: null,
    mqttClientId: 'echo-device-1',
    mqttDeviceId: 'device-1',
    mqttTopicPrefix: 'echo/device-1',
    mqttHomeAssistantDiscoveryEnabled: false,
    mqttHomeAssistantDiscoveryPrefix: 'homeassistant',
  },
  credentialConstruct: vi.fn(),
  runtimeConstruct: vi.fn(),
  adapterConstruct: vi.fn(),
  register: vi.fn(),
  start: vi.fn(async (_id: string) => undefined),
  dispose: vi.fn(async () => undefined),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test' },
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: () => mocks.settings,
  setAppSettings: (patch: Record<string, unknown>) => Object.assign(mocks.settings, patch),
}));

vi.mock('./MqttCredentialStore', () => ({
  MqttCredentialStore: class {
    constructor() {
      mocks.credentialConstruct();
    }

    hasPassword(): boolean { return false; }
    getPassword(): null { return null; }
    setPassword(): void {}
  },
}));

vi.mock('../core/IntegrationAdapterRuntime', () => ({
  IntegrationAdapterRuntime: class {
    constructor() {
      mocks.runtimeConstruct();
    }

    register(adapter: unknown): void { mocks.register(adapter); }
    start(id: string): Promise<void> { return mocks.start(id); }
    dispose(): Promise<void> { return mocks.dispose(); }
  },
}));

vi.mock('./MqttIntegrationAdapter', () => ({
  createMqttIntegrationTopics: () => ({ root: 'echo/device-1' }),
  MqttIntegrationAdapter: class {
    readonly id = 'mqtt';

    constructor() {
      mocks.adapterConstruct();
    }

    getDiagnostics(): undefined { return undefined; }
  },
}));

import {
  disposeMqttIntegration,
  syncMqttIntegrationFromSettings,
} from './MqttIntegrationService';

describe('default MQTT integration lifecycle', () => {
  beforeEach(async () => {
    await disposeMqttIntegration();
    vi.clearAllMocks();
    mocks.settings.mqttIntegrationEnabled = false;
  });

  it('does not construct the service while disabled', async () => {
    await syncMqttIntegrationFromSettings();

    expect(mocks.credentialConstruct).not.toHaveBeenCalled();
    expect(mocks.runtimeConstruct).not.toHaveBeenCalled();
  });

  it('starts when enabled and disposes the runtime when disabled', async () => {
    mocks.settings.mqttIntegrationEnabled = true;
    await syncMqttIntegrationFromSettings();

    expect(mocks.credentialConstruct).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeConstruct).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith('mqtt');

    mocks.settings.mqttIntegrationEnabled = false;
    await syncMqttIntegrationFromSettings();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
