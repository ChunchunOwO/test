// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MqttIntegrationPanel } from './MqttIntegrationPanel';

vi.mock('../../i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'zh-CN' }),
}));

const status = {
  settings: {
    enabled: false,
    brokerUrl: 'mqtt://127.0.0.1:1883',
    username: null,
    clientId: 'echo-test',
    deviceId: 'echo-test',
    topicPrefix: 'echo',
    homeAssistantDiscoveryEnabled: false,
    homeAssistantDiscoveryPrefix: 'homeassistant',
  },
  phase: 'disabled',
  connected: false,
  passwordConfigured: false,
  error: null,
  lastConnectedAt: null,
  lastCommandAt: null,
  topics: {
    root: 'echo/echo-test',
    state: 'echo/echo-test/state',
    event: 'echo/echo-test/event',
    command: 'echo/echo-test/command',
    result: 'echo/echo-test/result',
    availability: 'echo/echo-test/availability',
    homeAssistantDiscovery: null,
  },
} as const;

describe('MqttIntegrationPanel', () => {
  afterEach(() => cleanup());

  it('renders the settings variant as a collapsed beta panel', async () => {
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      updateSettings: vi.fn().mockResolvedValue(status),
    };

    const { container } = render(<MqttIntegrationPanel bridgeOverride={bridge} collapsible />);

    expect(await screen.findByText('MQTT 智能家居联动')).not.toBeNull();
    expect(screen.getByText('测试版')).not.toBeNull();

    const details = container.querySelector('details');
    const summary = container.querySelector('summary');
    expect(details?.open).toBe(false);

    fireEvent.click(summary!);
    expect(details?.open).toBe(true);
    expect(screen.getByText('Broker 地址')).not.toBeNull();
  });
});
