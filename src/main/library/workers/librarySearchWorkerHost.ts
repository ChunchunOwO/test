import { parentPort } from 'node:worker_threads';
import Database from 'better-sqlite3';
import type { EchoDatabase } from '../../database/createDatabase';
import { LibraryStore, type LibraryStoreSearchOptions } from '../LibraryStore';
import { buildTrackSearchTermsAsync, preloadSearchIndexRomanizer } from '../SearchIndexTokens';
import type { LibraryScanWorkerRequest, LibraryScanWorkerResponse } from './LibraryScanWorkerProtocol';

let remoteDatabase: EchoDatabase | null = null;
let remoteDatabasePath: string | null = null;
let remoteStore: LibraryStore | null = null;
let remoteSearchOptions: LibraryStoreSearchOptions = {};

const closeRemoteDatabase = (): void => {
  remoteStore = null;
  remoteDatabasePath = null;
  remoteDatabase?.close();
  remoteDatabase = null;
};

const getRemoteStore = (request: Extract<LibraryScanWorkerRequest, { type: 'library:remote-albums' }>): LibraryStore => {
  remoteSearchOptions = request.searchOptions;
  if (remoteStore && remoteDatabasePath === request.databasePath) {
    return remoteStore;
  }

  closeRemoteDatabase();
  remoteDatabase = new Database(request.databasePath, { readonly: true, fileMustExist: true });
  remoteDatabase.pragma('busy_timeout = 5000');
  remoteDatabase.pragma('temp_store = MEMORY');
  remoteDatabasePath = request.databasePath;
  remoteStore = new LibraryStore(remoteDatabase, () => remoteSearchOptions, { skipSearchTermsBackfill: true });
  return remoteStore;
};

const runRequest = async (request: LibraryScanWorkerRequest): Promise<LibraryScanWorkerResponse> => {
  try {
    if (request.type === 'search:preload') {
      return {
        requestId: request.requestId,
        ok: true,
        result: await preloadSearchIndexRomanizer(),
      };
    }
    if (request.type === 'search:terms') {
      return {
        requestId: request.requestId,
        ok: true,
        result: await buildTrackSearchTermsAsync(request.fields),
      };
    }
    if (request.type === 'library:remote-albums') {
      return {
        requestId: request.requestId,
        ok: true,
        result: getRemoteStore(request).getAlbums(request.query),
      };
    }
    return {
      requestId: request.requestId,
      ok: false,
      message: `Unsupported search worker request: ${request.type}`,
    };
  } catch (error) {
    return {
      requestId: request.requestId,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

parentPort?.on('message', (request: LibraryScanWorkerRequest) => {
  void runRequest(request).then((response) => {
    parentPort?.postMessage(response);
  });
});
parentPort?.on('close', closeRemoteDatabase);
