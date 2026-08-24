import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('remote-polish page shell', () => {
  const css = readFileSync('src/renderer/styles/remote-polish.css', 'utf8').replace(/\r\n/g, '\n');

  it('keeps inactive remote page-surfaces hidden so route switches do not flash', () => {
    expect(css).toMatch(/\.page-surface\[data-route-id='remote'\]\[hidden\] \{\n  display: none !important;\n\}/);
    expect(css).not.toMatch(/\.page-surface\[data-route-id='remote'\]:not\(\[hidden\]\) \{[\s\S]*?padding:\s*0/);
  });

  it('does not overlay a folder browser under the add catalog', () => {
    expect(css).not.toMatch(/\.remote-workbench-add \{[\s\S]*?position:\s*absolute/);
  });
});
