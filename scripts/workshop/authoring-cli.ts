import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  echoWorkshopConsumerAppId,
  workshopAuthoringKinds,
  WorkshopAuthoringService,
  type WorkshopAuthoringKind,
} from '../../src/main/workshop/WorkshopAuthoringService';
import {
  WorkshopAuthoringPublisher,
  workshopAuthoringRightsConfirmation,
} from '../../src/main/workshop/WorkshopAuthoringPublisher';

type ParsedArguments = {
  positional: string[];
  options: Map<string, string>;
};

const parseArguments = (input: string[]): ParsedArguments => {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index]!;
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    const optionValue = input[index + 1];
    if (!name || !optionValue || optionValue.startsWith('--')) {
      throw new Error(`Missing value for --${name}.`);
    }
    options.set(name, optionValue);
    index += 1;
  }
  return { positional, options };
};

const requireOption = (arguments_: ParsedArguments, name: string): string => {
  const value = arguments_.options.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required option --${name}.`);
  }
  return value;
};

const usage = `ECHO Workshop authoring CLI

Commands:
  init <directory> --kind <kind> --id <id> --title <title> --holder <license holder> [--min-version <version>]
  prepare <directory>
  validate <directory>
  preview <directory>
  publish-private <directory> --confirm-rights ${workshopAuthoringRightsConfirmation}

Kinds: ${workshopAuthoringKinds.join(', ')}
Target: ECHO main AppID ${echoWorkshopConsumerAppId} (private by default)
`;

const main = async (): Promise<void> => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const [command, directory] = arguments_.positional;
  if (!command || command === 'help' || command === '--help') {
    console.log(usage);
    return;
  }
  if (!directory) {
    throw new Error(`Missing project directory.\n\n${usage}`);
  }
  const rootDirectory = resolve(directory);
  const service = new WorkshopAuthoringService();

  if (command === 'init') {
    const kind = requireOption(arguments_, 'kind');
    if (!(workshopAuthoringKinds as readonly string[]).includes(kind)) {
      throw new Error(`Unsupported kind: ${kind}.`);
    }
    let minEchoVersion = arguments_.options.get('min-version')?.trim();
    if (!minEchoVersion) {
      const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { version?: string };
      minEchoVersion = packageJson.version;
    }
    if (!minEchoVersion) {
      throw new Error('Unable to resolve the current ECHO version.');
    }
    await service.createProject({
      rootDirectory,
      kind: kind as WorkshopAuthoringKind,
      id: requireOption(arguments_, 'id'),
      title: requireOption(arguments_, 'title'),
      licenseHolder: requireOption(arguments_, 'holder'),
      minEchoVersion,
    });
    console.log(`[workshop-author] Project created: ${rootDirectory}`);
    console.log('[workshop-author] Add preview.jpg (JPG/PNG/GIF, under 1 MB), then run prepare.');
    return;
  }

  if (command === 'prepare') {
    const prepared = await service.prepareProject(rootDirectory);
    console.log(`[workshop-author] Prepared ${prepared.manifest.id} ${prepared.manifest.version}.`);
    console.log(`[workshop-author] Content: ${prepared.contentDirectory}`);
    console.log(`[workshop-author] Private VDF: ${prepared.vdfPath}`);
    console.log(`[workshop-author] Listing preview: ${prepared.previewHtmlPath}`);
    return;
  }

  if (command === 'validate') {
    const validated = await service.validateProject(rootDirectory);
    console.log(`[workshop-author] Valid: ${validated.manifest.id} ${validated.manifest.version}.`);
    console.log(`[workshop-author] ${validated.manifest.files.length} files, ${validated.totalBytes} bytes.`);
    return;
  }

  if (command === 'preview') {
    const prepared = await service.prepareProject(rootDirectory);
    console.log(`[workshop-author] Listing preview: ${prepared.previewHtmlPath}`);
    return;
  }

  if (command === 'publish-private') {
    const rightsConfirmation = requireOption(arguments_, 'confirm-rights');
    const steamworks = await import('steamworks.js');
    const client = steamworks.init(Number(echoWorkshopConsumerAppId));
    const publisher = new WorkshopAuthoringPublisher(service, client.workshop);
    const published = await publisher.publishPrivateProject({ rootDirectory, rightsConfirmation });
    console.log(`[workshop-author] Private item ${published.created ? 'created' : 'updated'}: ${published.itemId}`);
    if (published.needsToAcceptAgreement) {
      console.log('[workshop-author] Steam requires the current account to accept the Workshop legal agreement.');
    }
    process.exit(0);
  }

  throw new Error(`Unknown command: ${command}.\n\n${usage}`);
};

void main().catch((error: unknown) => {
  console.error(`[workshop-author] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
