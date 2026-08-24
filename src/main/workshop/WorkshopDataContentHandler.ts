import type {
  WorkshopDataContentKind,
  WorkshopDataContribution,
  WorkshopDataContributionByKind,
} from './WorkshopDataContributionTypes';

export interface WorkshopDataContentHandler<K extends WorkshopDataContentKind> {
  readonly kind: K;

  normalize(input: unknown, expectedContentId: string): WorkshopDataContributionByKind[K];
}

export class WorkshopDataContentHandlerRegistry {
  private readonly handlers = new Map<
    WorkshopDataContentKind,
    WorkshopDataContentHandler<WorkshopDataContentKind>
  >();

  constructor(handlers: readonly WorkshopDataContentHandler<WorkshopDataContentKind>[]) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.kind)) {
        throw new Error(`workshop_data_handler_duplicate:${handler.kind}`);
      }
      this.handlers.set(handler.kind, handler);
    }
  }

  normalize(
    kind: WorkshopDataContentKind,
    input: unknown,
    expectedContentId: string,
  ): WorkshopDataContribution {
    const handler = this.handlers.get(kind);
    if (!handler) {
      throw new Error(`workshop_data_handler_missing:${kind}`);
    }
    return handler.normalize(input, expectedContentId);
  }
}
