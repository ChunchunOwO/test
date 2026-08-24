import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/renderer/styles/workshop-theme-skin.css', 'utf8');

describe('workshop theme skin CSS contract', () => {
  it('restyles chrome and stages without targeting oversized files', () => {
    expect(css).toContain('html[data-workshop-sidebar-presentation="overlay"]');
    expect(css).toContain('html[data-workshop-sidebar-presentation="rail"]');
    expect(css).toContain('html[data-workshop-player="hero"]');
    expect(css).toContain('html[data-workshop-home="cinema"]');
    expect(css).toContain('html[data-workshop-lyrics="theater"]');
    expect(css).toContain('html[data-workshop-queue="tickets"]');
    expect(css).toContain('html[data-workshop-songs="poster"]');
    expect(css).toContain('filter: brightness(');
    expect(css).not.toContain('url(');
  });
});
