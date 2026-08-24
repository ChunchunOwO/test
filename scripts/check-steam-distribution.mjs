import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const failures = [];

const assertAbsent = (label, content, patterns) => {
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      failures.push(`${label}: forbidden marker ${pattern}`);
    }
  }
};

const assertPresent = (label, content, patterns) => {
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      failures.push(`${label}: required marker ${pattern} is missing`);
    }
  }
};

const packageJson = read('package.json');
const packageManifest = JSON.parse(packageJson);
if (packageManifest.build?.appId !== 'app.echo.steam') {
  failures.push('package.json: Steam appId must be app.echo.steam');
}
if (packageManifest.build?.productName !== 'ECHO' || packageManifest.build?.executableName !== 'ECHO') {
  failures.push('package.json: Steam productName and executableName must both be ECHO');
}
if (!packageManifest.scripts?.['build:win:steam'] || !packageManifest.scripts?.['steam:depot:prepare']) {
  failures.push('package.json: signed loose Steam build and SteamPipe preview scripts are required');
}
const windowsExtraResources = packageManifest.build?.win?.extraResources ?? [];
const sharedExtraResources = packageManifest.build?.extraResources ?? [];
if (!sharedExtraResources.some(
  (entry) => entry?.from === 'docs/workshop-sdk' && entry?.to === 'workshop-sdk',
)) {
  failures.push('package.json: portable Workshop SDK must be copied into resources');
}
if (
  !windowsExtraResources.some(
    (entry) => entry?.from === 'electron-app/build/echo-steam-leaderboards.node' && entry?.to === 'echo-steam-leaderboards.node',
  )
) {
  failures.push('package.json: ECHO Steam leaderboard bridge must be copied into resources');
}
for (const steamworksRuntimeFile of ['steamworksjs.win32-x64-msvc.node', 'steam_api64.dll']) {
  if (
    !windowsExtraResources.some(
      (entry) =>
        typeof entry?.from === 'string' &&
        typeof entry?.to === 'string' &&
        entry.from.endsWith(`/win64/${steamworksRuntimeFile}`) &&
        entry.to.endsWith(`/win64/${steamworksRuntimeFile}`),
    )
  ) {
    failures.push(`package.json: Steamworks runtime ${steamworksRuntimeFile} must be copied into app.asar.unpacked`);
  }
}
assertAbsent('package.json', packageJson, [
  /prepare:win-ytdlp/iu,
  /yt-dlp\.exe/iu,
  /yt-dlp-manifest/iu,
  /electron-updater/iu,
  /@neteasecloudmusicapienhanced\/api/iu,
  /@unblockneteasemusic\/server/iu,
]);

assertPresent('Steam user-data identity', read('src/main/app/dataProtection.ts'), [
  /protectedUserDataFolderName\s*=\s*['"]ECHO Steam['"]/u,
  /legacyUserDataFolderNames:\s*readonly string\[\]\s*=\s*\[\]/u,
]);
assertPresent('cross-edition library and settings truth', read('src/main/app/editionDataSync.ts'), [
  /getSharedLibraryDatabasePath/u,
  /writeRegularEditionSharedSettingsPatch/u,
  /echo-settings\.sync\.lock/u,
]);
assertPresent('Windows Steam identity', read('src/main/app/lifecycle.ts'), [
  /app\.echo\.steam/u,
]);
assertPresent('SMTC Steam identity', read('native/smtc-host/src/main.cpp'), [
  /SetCurrentProcessExplicitAppUserModelID\(\s*L"app\.echo\.steam"\s*\)[\s\S]*CreateWindowExW/u,
]);
assertAbsent('Steam installer data cleanup', read('build/installer.nsh'), [
  /(?:RMDir|Delete)\s+\/r?\s+['"]?\$APPDATA\\ECHO(?:\\|['"\s])/iu,
  /(?:RMDir|Delete)\s+\/r?\s+['"]?\$LOCALAPPDATA\\ECHO(?:\\|['"\s])/iu,
]);

for (const packagePath of [
  'node_modules/@neteasecloudmusicapienhanced/api',
  'node_modules/@unblockneteasemusic/server',
  'node_modules/electron-updater',
]) {
  if (existsSync(join(root, packagePath))) {
    failures.push(`production dependency tree: forbidden installed package ${packagePath}`);
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmList = spawnSync(npmCommand, ['ls', '--omit=dev', '--depth=0', '--json'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
try {
  const dependencyTree = JSON.parse(npmList.stdout || '{}');
  for (const problem of dependencyTree.problems ?? []) {
    if (/\b(?:extraneous|invalid):/iu.test(problem)) {
      failures.push(`production dependency tree: ${problem}`);
    }
  }
} catch {
  failures.push('production dependency tree: npm ls returned invalid JSON');
}

assertAbsent('plugin manifest normalizer', read('src/main/plugins/PluginManifest.ts'), [/hostPage/iu, /osu-downloader/iu]);

assertPresent('Steam private-overlay assembly', read('electron.vite.config.ts'), [
  /src\/main\/plugins\/privateOverlayRuntime\.ts/u,
]);
assertAbsent('Steam private-overlay assembly', read('electron.vite.config.ts'), [
  /privateOverlayRuntime\.local/u,
]);
assertAbsent('main IPC assembly', read('src/main/ipc/registerIpc.ts'), [
  /registerPluginIpc/u,
  /getPluginService/u,
  /AppEchoProPluginActivate/u,
  /AppEchoProPluginReleaseCurrentDevice/u,
]);
assertAbsent('remote source IPC assembly', read('src/main/ipc/remoteSourcesIpc.ts'), [
  /BaiduOAuth/iu,
  /RemoteSourcesCreateBaiduAuthUrl/iu,
  /RemoteSourcesExchangeBaiduAuthCode/iu,
  /RemoteSourcesStartBaiduOAuthLogin/iu,
  /['"]mv['"]/u,
  /mvConcurrency/u,
]);
assertAbsent('remote source service assembly', read('src/main/library/remote/RemoteSourceService.ts'), [
  /BaiduRemoteSourceAdapter/iu,
]);
assertAbsent('remote source identity assembly', read('src/main/library/remote/remoteIdentity.ts'), [
  /stableKeyForBaidu/iu,
  /['"]baidu['"]/iu,
]);
assertPresent('remote source security boundaries', read('src/main/ipc/remoteSourcesIpc.ts'), [
  /RemoteSourcesSelectMountedRoot/u,
  /system folder picker/u,
  /trackId:\s*requireText\(request\.trackId/u,
  /requireTrustedRemoteSourcesSender/u,
  /normalizeRemoteSourceBaseUrl/u,
  /assertRemoteSourceConfigInput/u,
  /redactRemoteSourceForRenderer/u,
  /consumeMountedGrant/u,
  /requireTrustedMainRenderer/u,
]);
assertPresent('main renderer navigation boundary', read('src/main/app/createMainWindow.ts'), [
  /will-navigate/u,
  /will-redirect/u,
  /setWindowOpenHandler/u,
  /isTrustedRendererUrl/u,
]);
assertPresent('trusted renderer IPC boundary', read('src/main/app/trustedRenderer.ts'), [
  /senderFrame\s*!==\s*mainFrame/u,
  /isTrustedRendererUrl\(senderFrame\.url,\s*trustedUrl\)/u,
]);
assertAbsent('remote source public types', read('src/shared/types/remoteSources.ts'), [
  /RemoteBackgroundJobKind\s*=\s*[^;]*['"]mv['"]/u,
  /RemoteSourceIssueKind\s*=\s*[^;]*['"]mv['"]/u,
  /mvConcurrency/u,
  /mvStatus/u,
]);
assertAbsent('remote source renderer control surface', read('src/renderer/components/settings/RemoteSourcesPanel.tsx'), [
  /settings\.remote\.job\.mv/u,
  /settings\.remote\.background\.concurrency\.mv/u,
  /mvConcurrency/u,
  /\bMV\b/u,
]);
const remoteSourceLocaleSurface = [
  'enUS',
  'jaJP',
  'koKR',
  'zhCN',
  'zhTW',
].flatMap((locale) =>
  read(`src/renderer/i18n/locales/${locale}.ts`)
    .split(/\r?\n/u)
    .filter((line) => line.includes("'settings.remote.")),
).join('\n');
assertAbsent('remote source locale surface', remoteSourceLocaleSurface, [
  /\bMVs?\b/iu,
]);
assertPresent('mounted root capability privacy', read('src/shared/types/remoteSources.ts'), [
  /RemoteMountedRootGrant\s*=\s*\{[^}]*displayName:\s*string/u,
]);
assertAbsent('mounted root capability privacy', read('src/shared/types/remoteSources.ts'), [
  /RemoteMountedRootGrant\s*=\s*\{[^}]*path:\s*string/u,
]);
assertPresent('remote credential fail-closed storage', read('src/main/library/remote/RemoteSourceSecretStore.ts'), [
  /Secure credential storage is unavailable/u,
  /migrateLegacyPlaintext/u,
  /maximumCredentialBytes/u,
]);
assertAbsent('Subsonic credential transport', read('src/main/library/remote/adapters/SubsonicRemoteSourceAdapter.ts'), [
  /searchParams\.set\(['"]p['"],\s*secret\)/u,
]);
assertPresent('remote stream capability lifetime', read('src/main/library/remote/RemoteStreamProxyService.ts'), [
  /playbackTokenTtlMs\s*=\s*4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/u,
  /Math\.min\(playbackTokenTtlMs, requestedTtlMs\)/u,
  /redirect:\s*['"]error['"]/u,
  /activeUpstreamAborts/u,
  /startPromise/u,
  /await pipeline\(createReadStream\(filePath/u,
]);
assertPresent('remote source revision isolation', read('src/main/library/remote/RemoteLibrarySyncService.ts'), [
  /sourceRevisions/u,
  /invalidateSource\(sourceId/u,
  /assertSourceRevision/u,
]);
assertPresent('remote background revision isolation', read('src/main/library/remote/RemoteBackgroundJobQueue.ts'), [
  /revision:\s*number/u,
  /isSourceRevisionCurrent/u,
  /assertSourceWorkCurrent/u,
]);
assertPresent('WebDAV global scan budgets', read('src/main/library/remote/adapters/WebDavRemoteSourceAdapter.ts'), [
  /maximumWebDavEntriesPerScan/u,
  /maximumWebDavTracksPerScan/u,
  /maximumWebDavScanCacheBytes/u,
  /WebDavScanLimitError/u,
]);
assertPresent('credentialed HTTP literal-address boundary', read('src/main/library/remote/remoteSourceSecurity.ts'), [
  /isIP\(normalized\)/u,
]);
assertAbsent('credentialed HTTP literal-address boundary', read('src/main/library/remote/remoteSourceSecurity.ts'), [
  /normalized\.endsWith\(['"]\.local['"]\)/u,
  /!normalized\.includes\(['"]\.['"]\)/u,
]);
assertPresent('retired Baidu data cleanup', read('src/main/library/remote/RemoteLibraryStore.ts'), [
  /SET base_url = NULL, username = NULL/u,
  /DELETE FROM remote_tracks WHERE source_id/u,
  /DELETE FROM remote_provider_scan_cache WHERE source_id/u,
  /DELETE FROM remote_cover_cache WHERE source_id/u,
]);
assertPresent('mounted source scan limits', read('src/main/library/remote/adapters/RemoteFileSystemAdapter.ts'), [
  /maximumFileSystemDirectoriesPerScan/u,
  /maximumFileSystemEntriesPerDirectory/u,
  /maximumFileSystemTracksPerScan/u,
]);
assertPresent('credential transport validation', read('src/main/library/remote/adapters/WebDavRemoteSourceAdapter.ts'), [
  /createBackendUrl\(baseUrl,\s*input\.remotePath,\s*input\.source\.authType\)/u,
]);
assertPresent('credential transport validation', read('src/main/library/remote/adapters/MediaServerRemoteSourceAdapter.ts'), [
  /normalizeRemoteSourceBaseUrl\(provider,\s*source\.baseUrl,\s*source\.authType\)/u,
]);
assertAbsent('public entitlement assembly', read('src/main/plugins/privateEntitlements.ts'), [
  /from ['"]\.\/PluginService['"]/u,
]);
assertAbsent('preload assembly', read('src/preload/index.ts'), [
  /createPluginsApi/u,
  /plugins:\s*createPluginsApi/u,
]);
assertAbsent('preload app API assembly', read('src/preload/ipc/appApi.ts'), [
  /AppEchoProPluginActivate/u,
  /AppEchoProPluginReleaseCurrentDevice/u,
]);
assertAbsent('renderer route assembly', read('src/renderer/app/routes.tsx'), [
  /PluginsPage/u,
  /PluginPanelPage/u,
  /createPluginPanelRoutes/u,
  /id:\s*['"]plugins['"]/u,
]);
assertAbsent('renderer app assembly', read('src/renderer/app/AppLayout.tsx'), [
  /window\.echo(?:\?|)\.plugins/u,
  /plugins:changed/u,
  /app:navigate:plugins/u,
  /PluginTrackActionDrawer/u,
]);
assertAbsent('renderer settings assembly', read('src/renderer/pages/SettingsPage.tsx'), [
  /getPluginsBridge/u,
  /PluginsSettingsSection/u,
  /app:navigate:plugins/u,
  /plugins:changed/u,
]);
for (const startupStylePath of [
  'src/renderer/styles/app.css',
  'src/renderer/styles/songs.css',
  'src/renderer/styles/theme-presets.css',
]) {
  assertAbsent(`startup styles ${startupStylePath}`, read(startupStylePath), [/plugin/iu]);
}
assertPresent('retained plugin styles', read('src/renderer/styles/plugins.css'), [
  /\.plugins-page/u,
  /\.plugin-track-action-drawer/u,
]);
assertPresent('retained download styles', read('src/renderer/styles/downloads.css'), [
  /\.downloads-page/u,
]);
assertPresent('network metadata remains enabled', read('src/main/library/network/NetworkMetadataService.ts'), [
  /class NetworkMetadataService/u,
]);
assertPresent('network lyrics remain enabled', read('src/renderer/components/library/TrackTagEditorDrawer.tsx'), [
  /lyricsApi\.searchCandidates/u,
  /['"]lrclib['"]/u,
]);

const mainBundle = read('out/main/index.js');
const configuredReleaseAppId = process.env.ECHO_STEAM_RELEASE_APP_ID?.trim() ?? '';
const configuredProDlcAppId = process.env.ECHO_STEAM_PRO_DLC_APP_ID?.trim() ?? '';
if (configuredReleaseAppId) {
  if (!/^[1-9]\d*$/u.test(configuredReleaseAppId)) {
    failures.push('environment: ECHO_STEAM_RELEASE_APP_ID must be a positive numeric App ID');
  } else if (!mainBundle.includes(configuredReleaseAppId)) {
    failures.push('main bundle: configured Steam release App ID was not embedded at build time');
  }
}
if (configuredProDlcAppId) {
  if (!/^[1-9]\d*$/u.test(configuredProDlcAppId)) {
    failures.push('environment: ECHO_STEAM_PRO_DLC_APP_ID must be a positive numeric DLC App ID');
  } else if (!mainBundle.includes(configuredProDlcAppId)) {
    failures.push('main bundle: configured Steam Pro DLC App ID was not embedded at build time');
  }
}
assertAbsent('main bundle Steam configuration', mainBundle, [
  /ECHO_STEAM_RELEASE_APP_ID_BUNDLED/iu,
  /ECHO_STEAM_PRO_DLC_APP_ID_BUNDLED/iu,
]);
assertPresent('Workshop plugin activation boundary', read('src/main/workshop/WorkshopPluginService.ts'), [
  /workshopPluginCapabilities/u,
  /plugin-permission-unsupported/u,
  /plugin-network-hosts-require-capability/u,
  /plugin-network-request-requires-hosts/u,
  /plugin-setting-secret-unsupported/u,
  /plugin-settings-require-storage/u,
  /sameCapabilities\(record\.approvedCapabilities, permissions\)/u,
  /verifyRevision\(sourceId, itemId, revision\)/u,
]);
assertPresent('Workshop extensibility capability boundary', read('src/shared/types/workshop.ts'), [
  /'sources:direct'/u,
  /'agent:runtime'/u,
  /'playback:share'/u,
  /'network:request'/u,
]);
assertPresent('Workshop bounded network request boundary', read('src/main/workshop/WorkshopPluginNetworkService.ts'), [
  /permissions\.includes\('network:request'\)/u,
  /network-host-denied/u,
  /maximumRequestBodyBytes/u,
  /maximumResponseBodyBytes/u,
  /maximumConcurrentRequests/u,
  /redirect: 'manual'/u,
  /readResponseBodyLimited/u,
]);
assertPresent('Workshop playback sharing boundary', read('src/main/workshop/WorkshopPlaybackShareService.ts'), [
  /getRuntimePolicy/u,
  /permissions\.includes\('playback:share'\)/u,
  /share-destination-denied/u,
  /x-echo-track-metadata/u,
  /createReadStream/u,
]);
assertPresent('Workshop plugin protocol CSP', read('src/main/protocol/workshopAssetProtocol.ts'), [
  /workshopPluginContentSecurityPolicy/u,
  /connect-src 'none'/u,
  /media-src 'none'/u,
  /frame-src 'none'/u,
]);
assertPresent('Workshop plugin renderer sandbox', read('src/renderer/workshop/WorkshopPluginHost.tsx'), [
  /sandbox="allow-scripts"/u,
  /maximumRequestsPerSecond/u,
  /plugin\.permissions\.includes\(capability\)/u,
  /sanitizePlaybackStatus/u,
  /getWorkshopPluginDirectSourceOrigin/u,
  /maximumAgentResultBytes/u,
  /settings:get/u,
  /settings:set/u,
]);
assertPresent('Workshop plugin settings isolation', read('src/renderer/workshop/WorkshopPluginStorage.ts'), [
  /__settings\./u,
  /setting-undeclared/u,
  /storage-quota-exceeded/u,
  /maximumSettingStringLength/u,
]);
assertPresent('Workshop direct source host routing', read('src/renderer/workshop/WorkshopPluginMediaBridge.ts'), [
  /sources:playDirect/u,
  /provider: 'm3u8'/u,
  /routeToConnectOutput: false/u,
  /direct-source-platform-unsupported/u,
]);
assertPresent('Workshop frame navigation boundary', read('src/main/app/createMainWindow.ts'), [
  /will-frame-navigate/u,
  /isAllowedWorkshopFrameNavigation/u,
  /isWorkshopFrameUrl\(referrer\.url\)/u,
]);
assertAbsent('Workshop plugin renderer sandbox', read('src/renderer/workshop/WorkshopPluginHost.tsx'), [
  /window\.echo(?:\?|)\.plugins/u,
  /allow-same-origin/u,
  /nodeIntegration/u,
]);
assertPresent('Workshop audio plug-in profile binary boundary', read('src/main/workshop/WorkshopContentValidator.ts'), [
  /'\.vst3'/u,
  /'\.clap'/u,
  /'\.dll'/u,
  /workshop_content_executable_forbidden/u,
]);
assertPresent('Workshop audio plug-in profile schema', read('src/main/workshop/WorkshopAudioPluginProfileHandler.ts'), [
  /echo-workshop-audio-plugin-profile/u,
  /echo\.audio-plugin-adapter/u,
  /vst3ClassIdPattern/u,
  /workshop_data_audio_plugin_preset_parameter_unknown/u,
]);
assertAbsent('main bundle', mainBundle, [
  /electron-updater/iu,
  /class DownloadService/iu,
  /class StreamingService/iu,
  /class AccountService/iu,
  /YouTubeStreamingProvider/iu,
  /SoundCloudStreamingProvider/iu,
  /SpotifyStreamingProvider/iu,
  /TidalStreamingProvider/iu,
  /QobuzDownloadService/iu,
  /class MvService/iu,
  /createOnlineMvProviders/iu,
  /videoProtocol:mv-stream/iu,
  /yt-dlp is not installed/iu,
  /osu downloader/iu,
  /resolveLyricsBackgroundCover/iu,
  /resolve-lyrics-background-cover/iu,
  /highResolutionCoverUrl/iu,
  /class PluginService/iu,
  /echo\.plugin\.json/iu,
  /plugin-state\.json/iu,
  /BaiduRemoteSourceAdapter/iu,
  /BaiduOAuth/iu,
  /remoteSources:(?:createBaiduAuthUrl|exchangeBaiduAuthCode|startBaiduOAuthLogin)/iu,
  /pan\.baidu\.com\/rest\/2\.0\/xpan/iu,
  /openapi\.baidu\.com\/oauth\/2\.0\/token/iu,
]);
assertPresent('main bundle network radio', mainBundle, [
  /decodeM3u8ProviderTrackId/iu,
  /Music streaming playback is not available in the Steam distribution/iu,
]);

const rendererAssets = readdirSync(join(root, 'out/renderer/assets'));
const forbiddenAsset = rendererAssets.find((name) =>
  /(^streaming-|^plugins-.*\.css$|DownloadsPage|(?<!Steam)PlaylistsPage|StreamingSearchPage|StreamingConsentNoticeModal|QobuzAccount|SpotifyAccount|TidalAccount|YouTubeAccount|MvPanel|MvSettingsDrawer|PluginsPage|PluginPanel|PluginCommandPalette|shaka-player)/iu.test(name),
);
if (forbiddenAsset) {
  failures.push(`renderer assets: forbidden feature chunk ${forbiddenAsset}`);
}

const rendererJavaScript = rendererAssets
  .filter((name) => name.endsWith('.js'))
  .map((name) => readFileSync(join(root, 'out/renderer/assets', name), 'utf8'))
  .join('\n');
assertAbsent('renderer bundles', rendererJavaScript, [
  /app:check-for-updates/iu,
  /app:download-update/iu,
  /app:install-update/iu,
  /app:update-status-changed/iu,
  /StreamingConsentNoticeModal/iu,
  /lyricsHighResolutionNetworkCoverEnabled/iu,
  /resolveLyricsBackgroundCover/iu,
  /plugins:changed/iu,
  /app:navigate:plugins/iu,
  /settings\.remote\.provider\.baidu/iu,
  /baidu-oauth-helper/iu,
  /settings\.remote\.job\.mv/iu,
  /settings\.remote\.background\.concurrency\.mv/iu,
  /["']settings\.remote\.[^"']+["']\s*:\s*["'][^"'\r\n]*\bMVs?\b/iu,
]);

const preloadBundle = read('out/preload/index.mjs');
assertAbsent('preload bundle', preloadBundle, [
  /resolveLyricsBackgroundCover/iu,
  /resolve-lyrics-background-cover/iu,
  /createPluginsApi/iu,
  /installMarket\s*:/iu,
  /resolveSourcePlayback\s*:/iu,
  /activateEchoProPlugin\s*:/iu,
  /createBaiduAuthUrl\s*:/iu,
  /exchangeBaiduAuthCode\s*:/iu,
  /startBaiduOAuthLogin\s*:/iu,
  /mvConcurrency/iu,
]);

const rendererBoundaryChunks = rendererAssets
  .filter((name) => /^(SongsPage|SettingsPage|AlbumsPage|ArtistsPage|SteamPlaylistsPage)-.*\.js$/u.test(name))
  .map((name) => readFileSync(join(root, 'out/renderer/assets', name), 'utf8'))
  .join('\n');
assertAbsent('renderer boundary chunks', rendererBoundaryChunks, [
  /osuHiFi/iu,
  /osu-downloader/iu,
  /\.resolvePlayback\(/iu,
  /searchCatalog/iu,
  /createUrlJob/iu,
  /downloadsFeatureUnlocked/iu,
  /streamingDownloadActionsEnabled/iu,
  /mvProviderOrder/iu,
  /mvEnabledProviders/iu,
  /mvMaxQuality/iu,
]);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS Steam distribution excludes main-process/native plugins, downloads, platform streaming, and MV implementations while retaining the capability-gated Workshop sandbox.');
}
