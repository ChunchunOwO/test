const ultraLightGpuRuntimeArg = '--echo-ultra-light-gpu-runtime';

const withoutUltraLightRuntimeArgs = (argv: readonly string[] = process.argv): string[] =>
  argv.slice(1).filter((arg) => arg !== ultraLightGpuRuntimeArg);

export const isUltraLightGpuRuntime = (argv: readonly string[] = process.argv): boolean =>
  argv.includes(ultraLightGpuRuntimeArg);

export const createUltraLightGpuRuntimeArgs = (argv: readonly string[] = process.argv): string[] => [
  ...withoutUltraLightRuntimeArgs(argv),
  ultraLightGpuRuntimeArg,
];

export const createNormalRuntimeArgs = (argv: readonly string[] = process.argv): string[] =>
  withoutUltraLightRuntimeArgs(argv);

export const prepareNormalRuntimeRelaunch = (
  argv: readonly string[] = process.argv,
  environment: NodeJS.ProcessEnv = process.env,
): string[] => {
  // electron-vite exits its renderer dev server when the original Electron
  // process closes. A relaunched process must therefore use the built renderer
  // instead of inheriting a URL that is about to disappear.
  delete environment.ELECTRON_RENDERER_URL;
  return createNormalRuntimeArgs(argv);
};
