import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const readImageDimensions = (buffer, extension) => {
  if (extension === '.png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (extension === '.gif' && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
};

const issue = (code, severity, message) => ({ code, severity, message });
const containsPlaceholder = (value) => /radio\.example|replace with|workshop author|my echo|todo|00000000000000000000000000000000/iu.test(value);

export const buildQualityReport = async (root, project, manifest, entry) => {
  const issues = [];
  const previewPath = resolve(root, project.previewFile);
  const preview = await readFile(previewPath);
  const dimensions = readImageDimensions(preview, extname(previewPath).toLowerCase());
  if (!dimensions) issues.push(issue('preview-readable', 'blocker', 'Preview image dimensions could not be read.'));
  else {
    issues.push(dimensions.width >= 195 && dimensions.height >= 195
      ? issue('preview-size', 'pass', `Preview is ${dimensions.width} x ${dimensions.height}.`)
      : issue('preview-size', 'blocker', `Preview is ${dimensions.width} x ${dimensions.height}; Steam guides and listings need at least 195 x 195.`));
    issues.push(Math.abs(dimensions.width - dimensions.height) <= Math.max(4, dimensions.width * 0.05)
      ? issue('preview-square', 'pass', 'Preview aspect ratio is suitable for Workshop discovery.')
      : issue('preview-square', 'warning', 'A square preview is recommended for consistent Workshop discovery.'));
  }
  issues.push(project.description.trim().length >= 80
    ? issue('description', 'pass', 'Listing description has enough context.')
    : issue('description', 'warning', 'Expand the listing description to at least 80 characters.'));
  issues.push(project.changeNote.trim().length >= 12
    ? issue('change-note', 'pass', 'A meaningful change note is present.')
    : issue('change-note', 'warning', 'Explain what changed before updating the item.'));
  issues.push(Array.isArray(project.tags) && project.tags.length > 0
    ? issue('tags', 'pass', `${project.tags.length} Workshop tag(s) declared.`)
    : issue('tags', 'blocker', 'At least one Workshop tag is required.'));
  issues.push(typeof manifest.compatibility?.minEchoVersion === 'string'
    ? issue('compatibility', 'pass', `Minimum ECHO version is ${manifest.compatibility.minEchoVersion}.`)
    : issue('compatibility', 'blocker', 'compatibility.minEchoVersion is missing.'));
  const serialized = JSON.stringify({ manifest, entry, project });
  issues.push(containsPlaceholder(serialized)
    ? issue('placeholders', manifest.content.kind === 'audio-plugin-profile' ? 'blocker' : 'warning', 'Template placeholders remain in the project.')
    : issue('placeholders', 'pass', 'Common template placeholders were not found.'));
  try {
    const readme = await readFile(resolve(root, 'README.md'), 'utf8');
    issues.push(readme.trim().length >= 80
      ? issue('documentation', 'pass', 'Project README is present.')
      : issue('documentation', 'warning', 'Expand README.md with setup and usage instructions.'));
  } catch {
    issues.push(issue('documentation', 'warning', 'Add README.md with setup, capabilities and support notes.'));
  }
  return {
    ok: !issues.some((entryIssue) => entryIssue.severity === 'blocker'),
    summary: {
      pass: issues.filter((entryIssue) => entryIssue.severity === 'pass').length,
      warning: issues.filter((entryIssue) => entryIssue.severity === 'warning').length,
      blocker: issues.filter((entryIssue) => entryIssue.severity === 'blocker').length,
    },
    issues,
  };
};
