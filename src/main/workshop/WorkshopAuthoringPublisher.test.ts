import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkshopAuthoringService,
  workshopAuthoringProjectFileName,
} from './WorkshopAuthoringService';
import {
  WorkshopAuthoringPublisher,
  workshopAuthoringRightsConfirmation,
  type WorkshopAuthoringPublishClient,
} from './WorkshopAuthoringPublisher';

const previewFixture = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

const createPrivateThemeProject = async () => {
  const rootDirectory = join(await mkdtemp(join(tmpdir(), 'echo-workshop-publisher-')), 'project');
  const authoring = new WorkshopAuthoringService();
  await authoring.createProject({
    rootDirectory,
    kind: 'theme',
    id: 'echo.publisher-test',
    title: 'Publisher Test',
    licenseHolder: 'ECHO Test',
    minEchoVersion: '26.8.2-beta.4',
  });
  await writeFile(resolve(rootDirectory, 'preview.jpg'), previewFixture);
  return { rootDirectory, authoring };
};

const createClient = (): WorkshopAuthoringPublishClient => ({
  createItem: vi.fn(async () => ({ itemId: 123456789n, needsToAcceptAgreement: false })),
  updateItem: vi.fn(async (itemId) => ({ itemId, needsToAcceptAgreement: false })),
});

describe('WorkshopAuthoringPublisher', () => {
  it('creates and uploads a private item with validated tags, then records its id', async () => {
    const { rootDirectory, authoring } = await createPrivateThemeProject();
    const client = createClient();
    const publisher = new WorkshopAuthoringPublisher(authoring, client);

    const result = await publisher.publishPrivateProject({
      rootDirectory,
      rightsConfirmation: workshopAuthoringRightsConfirmation,
    });

    expect(result).toEqual({
      itemId: '123456789',
      created: true,
      needsToAcceptAgreement: false,
    });
    expect(client.createItem).toHaveBeenCalledWith(5105090);
    expect(client.updateItem).toHaveBeenCalledWith(123456789n, expect.objectContaining({
      title: 'Publisher Test',
      tags: ['Theme'],
      visibility: 2,
      contentPath: resolve(rootDirectory, 'content'),
      previewPath: resolve(rootDirectory, 'preview.jpg'),
    }), 5105090);
    const config = JSON.parse(await readFile(
      resolve(rootDirectory, workshopAuthoringProjectFileName),
      'utf8',
    )) as { publishedFileId: string };
    expect(config.publishedFileId).toBe('123456789');
  });

  it('requires an explicit rights confirmation before inspecting or uploading', async () => {
    const { rootDirectory, authoring } = await createPrivateThemeProject();
    const client = createClient();
    const prepare = vi.spyOn(authoring, 'prepareProject');
    const publisher = new WorkshopAuthoringPublisher(authoring, client);

    await expect(publisher.publishPrivateProject({
      rootDirectory,
      rightsConfirmation: 'yes',
    })).rejects.toThrow('workshop_authoring_rights_confirmation_required');

    expect(prepare).not.toHaveBeenCalled();
    expect(client.createItem).not.toHaveBeenCalled();
  });

  it('rejects non-private projects', async () => {
    const { rootDirectory, authoring } = await createPrivateThemeProject();
    const configPath = resolve(rootDirectory, workshopAuthoringProjectFileName);
    const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    await writeFile(configPath, `${JSON.stringify({ ...config, visibility: 'public' }, null, 2)}\n`);
    const client = createClient();
    const publisher = new WorkshopAuthoringPublisher(authoring, client);

    await expect(publisher.publishPrivateProject({
      rootDirectory,
      rightsConfirmation: workshopAuthoringRightsConfirmation,
    })).rejects.toThrow('workshop_authoring_private_publish_required');

    expect(client.createItem).not.toHaveBeenCalled();
  });

  it('records a newly created id before surfacing an upload failure', async () => {
    const { rootDirectory, authoring } = await createPrivateThemeProject();
    const client = createClient();
    vi.mocked(client.updateItem).mockRejectedValueOnce(new Error('upload_failed'));
    const publisher = new WorkshopAuthoringPublisher(authoring, client);

    await expect(publisher.publishPrivateProject({
      rootDirectory,
      rightsConfirmation: workshopAuthoringRightsConfirmation,
    })).rejects.toThrow('upload_failed');

    const config = JSON.parse(await readFile(
      resolve(rootDirectory, workshopAuthoringProjectFileName),
      'utf8',
    )) as { publishedFileId: string };
    expect(config.publishedFileId).toBe('123456789');
  });

  it('publishes public projects only after the explicit publication confirmation', async () => {
    const { rootDirectory, authoring } = await createPrivateThemeProject();
    const configPath = resolve(rootDirectory, workshopAuthoringProjectFileName);
    const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    await writeFile(configPath, `${JSON.stringify({ ...config, visibility: 'public' }, null, 2)}\n`);
    const client = createClient();
    const publisher = new WorkshopAuthoringPublisher(authoring, client);

    await expect(publisher.publishProject({
      rootDirectory,
      rightsConfirmation: workshopAuthoringRightsConfirmation,
      publicationConfirmation: 'publish-to-steam-workshop',
    })).resolves.toEqual({
      itemId: '123456789',
      created: true,
      visibility: 'public',
      needsToAcceptAgreement: false,
    });
    expect(client.updateItem).toHaveBeenCalledWith(123456789n, expect.objectContaining({ visibility: 0 }), 5105090);
  });
});
