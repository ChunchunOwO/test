import type { FileIdentityObservation } from '../FileIdentityService';
import type { LibraryStoreSearchOptions } from '../LibraryStore';
import type {
  CoverCacheRepairOptions,
  CoverExtractOptions,
  CoverResult,
  LibraryAlbum,
  LibraryPage,
  LibraryPageQuery,
  MetadataResult,
} from '../libraryTypes';
import type { SearchIndexTrackFields } from '../SearchIndexTokens';

export type LibraryScanWorkerRequest =
  | {
      requestId: number;
      type: 'metadata:read';
      filePath: string;
    }
  | {
      requestId: number;
      type: 'cover:extract';
      filePath: string;
      options: CoverExtractOptions;
    }
  | {
      requestId: number;
      type: 'cover:repair';
      options: CoverCacheRepairOptions;
    }
  | {
      requestId: number;
      type: 'identity:observe';
      filePath: string;
    }
  | {
      requestId: number;
      type: 'search:preload';
    }
  | {
      requestId: number;
      type: 'search:terms';
      fields: SearchIndexTrackFields;
    }
  | {
      requestId: number;
      type: 'library:remote-albums';
      databasePath: string;
      query: LibraryPageQuery;
      searchOptions: LibraryStoreSearchOptions;
    };

export type LibraryScanWorkerResult =
  | MetadataResult
  | CoverResult
  | FileIdentityObservation
  | LibraryPage<LibraryAlbum>
  | string
  | boolean;

export type LibraryScanWorkerResponse =
  | {
      requestId: number;
      ok: true;
      result: LibraryScanWorkerResult;
    }
  | {
      requestId: number;
      ok: false;
      message: string;
    };

export type LibraryScanWorkerRequestForType<Type extends LibraryScanWorkerRequest['type']> = Extract<
  LibraryScanWorkerRequest,
  { type: Type }
>;

export type LibraryScanWorkerResultForType<Type extends LibraryScanWorkerRequest['type']> =
  Type extends 'metadata:read'
    ? MetadataResult
    : Type extends 'identity:observe'
      ? FileIdentityObservation
      : Type extends 'search:preload'
        ? boolean
        : Type extends 'search:terms'
          ? string
          : Type extends 'library:remote-albums'
            ? LibraryPage<LibraryAlbum>
            : CoverResult;
