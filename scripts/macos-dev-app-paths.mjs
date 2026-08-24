import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const getMacosDevAppCandidates = ({ projectRoot, arch = process.arch }) => [
  join(projectRoot, 'dist', `mac-${arch}`, 'ECHO.app'),
  join(projectRoot, 'dist', 'mac', 'ECHO.app'),
];

export const findMacosDevApp = ({
  projectRoot,
  arch = process.arch,
  pathExists = existsSync,
}) => getMacosDevAppCandidates({ projectRoot, arch }).find((candidate) => pathExists(candidate)) ?? null;
