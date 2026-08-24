import type { JsonRpcBridge } from './JsonRpcBridge';

export let activeJsonRpcBridge: JsonRpcBridge | null = null;
type ActiveJsonRpcBridgeListener = (bridge: JsonRpcBridge | null) => void;
const activeJsonRpcBridgeListeners = new Set<ActiveJsonRpcBridgeListener>();

function notifyActiveJsonRpcBridgeChanged(): void {
  for (const listener of activeJsonRpcBridgeListeners) {
    try {
      listener(activeJsonRpcBridge);
    } catch {
      // A diagnostics/UI subscriber must never break host bridge ownership.
    }
  }
}

export function getActiveJsonRpcBridge(): JsonRpcBridge | null {
  return activeJsonRpcBridge;
}

export function setActiveJsonRpcBridge(bridge: JsonRpcBridge): void {
  if (activeJsonRpcBridge === bridge) return;
  activeJsonRpcBridge = bridge;
  notifyActiveJsonRpcBridgeChanged();
}

export function clearActiveJsonRpcBridge(): void {
  if (activeJsonRpcBridge === null) return;
  activeJsonRpcBridge = null;
  notifyActiveJsonRpcBridgeChanged();
}

export function clearActiveJsonRpcBridgeIf(bridge: JsonRpcBridge | null): void {
  if (activeJsonRpcBridge === bridge) {
    activeJsonRpcBridge = null;
    notifyActiveJsonRpcBridgeChanged();
  }
}

export function onActiveJsonRpcBridgeChanged(listener: ActiveJsonRpcBridgeListener): () => void {
  activeJsonRpcBridgeListeners.add(listener);
  listener(activeJsonRpcBridge);
  return () => activeJsonRpcBridgeListeners.delete(listener);
}
