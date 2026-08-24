import type { WorkshopAuthoringService } from './WorkshopAuthoringService';
import type {
  WorkshopAuthoringPublishRequest,
  WorkshopAuthoringPublishResult,
  WorkshopAuthoringVisibility,
} from '../../shared/types/workshop';

export const workshopAuthoringRightsConfirmation = 'owned-or-authorized' as const;
export const workshopAuthoringPublicationConfirmation = 'publish-to-steam-workshop' as const;

const workshopVisibility: Record<WorkshopAuthoringVisibility, 0 | 1 | 2 | 3> = {
  public: 0,
  'friends-only': 1,
  private: 2,
  unlisted: 3,
};

type WorkshopPublishResult = {
  itemId: bigint;
  needsToAcceptAgreement: boolean;
};

export type WorkshopAuthoringPublishClient = {
  createItem(appId?: number | null): Promise<WorkshopPublishResult>;
  updateItem(
    itemId: bigint,
    update: {
      title: string;
      description: string;
      changeNote: string;
      previewPath: string;
      contentPath: string;
      tags: string[];
      visibility: 0 | 1 | 2 | 3;
    },
    appId?: number | null,
  ): Promise<WorkshopPublishResult>;
};

export type PublishPrivateWorkshopProjectOptions = {
  rootDirectory: string;
  rightsConfirmation: string;
};

export type PublishPrivateWorkshopProjectResult = {
  itemId: string;
  created: boolean;
  needsToAcceptAgreement: boolean;
};

const positiveItemId = (value: bigint): bigint => {
  if (value <= 0n) {
    throw new Error('workshop_authoring_publish_item_id_invalid');
  }
  return value;
};

export class WorkshopAuthoringPublisher {
  constructor(
    private readonly authoring: WorkshopAuthoringService,
    private readonly client: WorkshopAuthoringPublishClient,
  ) {}

  async publishPrivateProject(
    options: PublishPrivateWorkshopProjectOptions,
  ): Promise<PublishPrivateWorkshopProjectResult> {
    if (options.rightsConfirmation !== workshopAuthoringRightsConfirmation) {
      throw new Error('workshop_authoring_rights_confirmation_required');
    }
    const prepared = await this.authoring.prepareProject(options.rootDirectory);
    if (prepared.config.visibility !== 'private') {
      throw new Error('workshop_authoring_private_publish_required');
    }

    const result = await this.publishPreparedProject(prepared, options.rightsConfirmation);
    return {
      itemId: result.itemId,
      created: result.created,
      needsToAcceptAgreement: result.needsToAcceptAgreement,
    };
  }

  async publishProject(options: WorkshopAuthoringPublishRequest): Promise<WorkshopAuthoringPublishResult> {
    if (options.rightsConfirmation !== workshopAuthoringRightsConfirmation) {
      throw new Error('workshop_authoring_rights_confirmation_required');
    }
    if (options.publicationConfirmation !== workshopAuthoringPublicationConfirmation) {
      throw new Error('workshop_authoring_publication_confirmation_required');
    }
    const prepared = await this.authoring.prepareProject(options.rootDirectory);
    return this.publishPreparedProject(prepared, options.rightsConfirmation);
  }

  private async publishPreparedProject(
    prepared: Awaited<ReturnType<WorkshopAuthoringService['prepareProject']>>,
    rightsConfirmation: string,
  ): Promise<WorkshopAuthoringPublishResult> {
    if (rightsConfirmation !== workshopAuthoringRightsConfirmation) {
      throw new Error('workshop_authoring_rights_confirmation_required');
    }
    const appId = Number(prepared.config.appId);
    let itemId: bigint;
    let created = false;
    let needsToAcceptAgreement = false;

    if (prepared.config.publishedFileId === '0') {
      const createdItem = await this.client.createItem(appId);
      itemId = positiveItemId(createdItem.itemId);
      created = true;
      needsToAcceptAgreement = createdItem.needsToAcceptAgreement;
      await this.authoring.recordPublishedFileId(prepared.rootDirectory, itemId.toString());
    } else {
      itemId = positiveItemId(BigInt(prepared.config.publishedFileId));
    }

    const updatedItem = await this.client.updateItem(itemId, {
      title: prepared.manifest.title,
      description: prepared.config.description,
      changeNote: prepared.config.changeNote,
      previewPath: prepared.previewPath,
      contentPath: prepared.contentDirectory,
      tags: [...prepared.config.tags],
      visibility: workshopVisibility[prepared.config.visibility],
    }, appId);
    positiveItemId(updatedItem.itemId);
    needsToAcceptAgreement ||= updatedItem.needsToAcceptAgreement;

    return {
      itemId: itemId.toString(),
      created,
      visibility: prepared.config.visibility,
      needsToAcceptAgreement,
    };
  }
}
