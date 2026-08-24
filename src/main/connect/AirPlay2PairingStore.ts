import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';

export type AirPlay2PairedController = {
  identifier: string;
  publicKey: Buffer;
  permissions: number;
};

export type AirPlay2PairingStoreLike = {
  getController: (identifier: string) => AirPlay2PairedController | null;
  saveController: (controller: AirPlay2PairedController) => void;
};

type StoredAirPlay2Controller = {
  publicKey?: string;
  permissions?: number;
};

type StoredAirPlay2Pairings = {
  version?: number;
  controllers?: Record<string, StoredAirPlay2Controller>;
};

const pairingFileName = 'airplay2-pairings.json';
const maxStoredControllers = 64;

const normalizeIdentifier = (identifier: string): string | null => {
  const value = identifier.trim();
  return value.length > 0 && value.length <= 256 ? value : null;
};

const decodeController = (
  identifier: string,
  stored: StoredAirPlay2Controller | undefined,
): AirPlay2PairedController | null => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier || !stored?.publicKey || !/^[\da-f]{64}$/iu.test(stored.publicKey)) {
    return null;
  }
  return {
    identifier: normalizedIdentifier,
    publicKey: Buffer.from(stored.publicKey, 'hex'),
    permissions: Number.isInteger(stored.permissions) ? Number(stored.permissions) & 0xff : 0,
  };
};

export class AirPlay2PairingStore implements AirPlay2PairingStoreLike {
  private readonly controllers = new Map<string, AirPlay2PairedController>();

  constructor(private readonly filePath: string | null) {
    this.load();
  }

  getController(identifier: string): AirPlay2PairedController | null {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    if (!normalizedIdentifier) {
      return null;
    }
    const controller = this.controllers.get(normalizedIdentifier);
    return controller
      ? { ...controller, publicKey: Buffer.from(controller.publicKey) }
      : null;
  }

  saveController(controller: AirPlay2PairedController): void {
    const identifier = normalizeIdentifier(controller.identifier);
    if (!identifier || controller.publicKey.length !== 32) {
      throw new Error('AirPlay 2 controller pairing is invalid.');
    }

    if (!this.controllers.has(identifier) && this.controllers.size >= maxStoredControllers) {
      throw new Error(`AirPlay 2 controller pairing limit reached (${maxStoredControllers}).`);
    }

    this.controllers.set(identifier, {
      identifier,
      publicKey: Buffer.from(controller.publicKey),
      permissions: controller.permissions & 0xff,
    });
    this.save();
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoredAirPlay2Pairings;
      for (const [identifier, stored] of Object.entries(parsed.controllers ?? {}).slice(0, maxStoredControllers)) {
        const controller = decodeController(identifier, stored);
        if (controller) {
          this.controllers.set(controller.identifier, controller);
        }
      }
    } catch {
      this.controllers.clear();
    }
  }

  private save(): void {
    if (!this.filePath) {
      return;
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    const controllers = Object.fromEntries(
      [...this.controllers.entries()].map(([identifier, controller]) => [
        identifier,
        {
          publicKey: controller.publicKey.toString('hex'),
          permissions: controller.permissions,
        },
      ]),
    );
    writeFileSync(this.filePath, `${JSON.stringify({ version: 1, controllers }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}

const resolveDefaultPairingPath = (): string | null => {
  try {
    const userDataPath = app?.getPath?.('userData');
    return userDataPath ? join(userDataPath, pairingFileName) : null;
  } catch {
    return null;
  }
};

export const createDefaultAirPlay2PairingStore = (): AirPlay2PairingStore =>
  new AirPlay2PairingStore(resolveDefaultPairingPath());
