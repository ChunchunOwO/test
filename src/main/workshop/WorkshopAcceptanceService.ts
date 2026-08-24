import type {
  WorkshopAcceptanceRequest,
  WorkshopAcceptanceResult,
  WorkshopAcceptanceStep,
  WorkshopManagerItem,
} from '../../shared/types/workshop';
import type { WorkshopManagerService } from './WorkshopManagerService';

type AcceptanceManager = Pick<WorkshopManagerService, 'getSnapshot' | 'subscribe' | 'unsubscribe' | 'use' | 'disable'>;

const itemIdPattern = /^[1-9]\d{0,19}$/u;
const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class WorkshopAcceptanceService {
  constructor(
    private readonly manager: AcceptanceManager,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(request: WorkshopAcceptanceRequest): Promise<WorkshopAcceptanceResult> {
    const itemId = request.itemId?.trim();
    if (!itemIdPattern.test(itemId)) throw new Error('workshop_acceptance_item_id_invalid');
    const timeoutSeconds = Math.min(180, Math.max(15, Math.trunc(request.timeoutSeconds ?? 90)));
    const deadline = Date.now() + timeoutSeconds * 1_000;
    const startedAt = this.now().toISOString();
    const steps: WorkshopAcceptanceStep[] = [];
    const initial = this.manager.getSnapshot();
    if (!initial.source.available) {
      steps.push({ id: 'source', ok: false, detail: initial.source.reason });
      return this.result(false, itemId, startedAt, steps);
    }
    steps.push({ id: 'source', ok: true, detail: 'steam-workshop-ready' });
    const wasSubscribed = initial.source.items.some((item) => item.itemId === itemId && item.subscribed);

    if (!wasSubscribed) {
      const subscribed = await this.manager.subscribe({ sourceId: 'steam', itemId });
      if (!subscribed.ok) {
        steps.push({ id: 'subscribe', ok: false, detail: subscribed.reason ?? 'subscribe-failed' });
        return this.result(false, itemId, startedAt, steps);
      }
    }
    steps.push({ id: 'subscribe', ok: true, detail: wasSubscribed ? 'already-subscribed' : 'subscribed' });

    let current: WorkshopManagerItem | undefined;
    while (Date.now() < deadline) {
      const use = await this.manager.use({
        sourceId: 'steam',
        itemId,
        approveUiRuntime: request.approveUiRuntime,
        approvePluginCapabilities: request.approvePluginCapabilities,
      });
      current = use.snapshot.items.find((item) => item.sourceId === 'steam' && item.itemId === itemId);
      if (use.ok && use.reason !== 'download-started') {
        steps.push({ id: 'download', ok: true, detail: current?.subscription?.installed ? 'installed' : 'already-current' });
        steps.push({ id: 'ingest-enable', ok: true, detail: 'use-completed' });
        break;
      }
      if (!use.ok && !['invalid-request', 'not-installed', 'not-subscribed'].includes(use.reason ?? '')) {
        steps.push({ id: 'ingest-enable', ok: false, detail: use.reason ?? 'use-failed' });
        return this.finishWithCleanup(false, request, wasSubscribed, itemId, startedAt, steps);
      }
      await wait(750);
    }

    current = this.manager.getSnapshot().items.find((item) => item.sourceId === 'steam' && item.itemId === itemId);
    const verified = Boolean(current?.enabled && (current.catalogReady || current.contentKind === 'plugin-package'));
    steps.push({ id: 'verify', ok: verified, detail: verified ? `${current?.contentKind}:${current?.version}` : 'enabled-runtime-not-ready' });
    return this.finishWithCleanup(verified, request, wasSubscribed, itemId, startedAt, steps);
  }

  private async finishWithCleanup(
    ok: boolean,
    request: WorkshopAcceptanceRequest,
    wasSubscribed: boolean,
    itemId: string,
    startedAt: string,
    steps: WorkshopAcceptanceStep[],
  ): Promise<WorkshopAcceptanceResult> {
    if (request.cleanupSubscription === true && !wasSubscribed) {
      await this.manager.disable({ sourceId: 'steam', itemId });
      const cleanup = await this.manager.unsubscribe({ sourceId: 'steam', itemId });
      steps.push({ id: 'cleanup', ok: cleanup.ok, detail: cleanup.ok ? 'temporary-subscription-removed' : cleanup.reason ?? 'cleanup-failed' });
      ok &&= cleanup.ok;
    }
    return this.result(ok, itemId, startedAt, steps);
  }

  private result(ok: boolean, itemId: string, startedAt: string, steps: WorkshopAcceptanceStep[]): WorkshopAcceptanceResult {
    const current = this.manager.getSnapshot().items.find((item) => item.sourceId === 'steam' && item.itemId === itemId);
    return {
      ok,
      itemId,
      startedAt,
      completedAt: this.now().toISOString(),
      steps,
      finalState: current?.state ?? 'missing',
    };
  }
}
