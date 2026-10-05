import { describe, expect, it } from 'vitest';
import { assetLinksContent, pwaOptions } from '../vite.config';

describe('the installed app identity', () => {
  it('pins the install identity to the app root, so one phone cannot install two', () => {
    // Without `id`, the identity is derived from the URL that opened the PWA, so
    // a shared /mock link can install as a separate app next to the one the
    // learner already has.
    expect(pwaOptions.manifest.id).toBe('/');
    expect(pwaOptions.manifest.start_url).toBeTruthy();
    expect(String(pwaOptions.manifest.start_url).startsWith('/')).toBe(true);
    // `scope` must cover the routes the launcher shortcuts point at.
    expect(pwaOptions.manifest.scope).toBe('/');
  });

  it('launches standalone, in Arabic, from the right direction', () => {
    expect(pwaOptions.manifest.display).toBe('standalone');
    expect(pwaOptions.manifest.dir).toBe('rtl');
    expect(pwaOptions.manifest.lang).toBe('ar');
    expect(pwaOptions.manifest.orientation).toBe('portrait');
    // Arabic name and description: this is the string Play shows a learner.
    expect(String(pwaOptions.manifest.name)).toMatch(/[؀-ۿ]/);
    expect(String(pwaOptions.manifest.description)).toMatch(/[؀-ۿ]/);
  });

  it('ships an opaque 512 icon in both purposes, which is what installability needs', () => {
    const icons = pwaOptions.manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
    const any512 = icons.some((i) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any'));
    const maskable512 = icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable');
    expect(any512).toBe(true);
    // Play's installability check and every Android launcher mask require it.
    expect(maskable512).toBe(true);
  });

  it('keeps every launcher shortcut inside the scope', () => {
    const shortcuts = (pwaOptions.manifest.shortcuts ?? []) as Array<{ url?: string; name?: string }>;
    expect(shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of shortcuts) {
      expect(String(shortcut.url).startsWith('/')).toBe(true);
      expect(String(shortcut.url).startsWith(String(pwaOptions.manifest.scope))).toBe(true);
      expect(String(shortcut.name)).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('digital asset links', () => {
  it('emits an empty statement list rather than a placeholder fingerprint', () => {
    // A file that EXISTS with `[]` fails Android verification just as loudly as
    // a missing one, which is the honest state: nothing has been configured.
    expect(assetLinksContent()).toBe('[]\n');
    expect(assetLinksContent({})).toBe('[]\n');
  });

  it('emits the real statement as soon as both inputs are present', () => {
    const parsed = JSON.parse(
      assetLinksContent({
        packageName: 'app.ghaidakalosh008.katzu',
        certSha256: 'AA:BB:CC',
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].target).toMatchObject({
      namespace: 'android_app',
      package_name: 'app.ghaidakalosh008.katzu',
      sha256_cert_fingerprints: ['AA:BB:CC'],
    });
    // handle_all_urls is the relation a TWA needs; without it the link opens a
    // browser tab instead of the app.
    expect(parsed[0].relation).toContain('delegate_permission/common.handle_all_urls');
  });

  it('emits nothing usable when only one half is configured', () => {
    expect(JSON.parse(assetLinksContent({ packageName: 'app.katzu' }))).toEqual([]);
    expect(JSON.parse(assetLinksContent({ certSha256: 'AA:BB:CC' }))).toEqual([]);
    // Whitespace is not a value.
    expect(JSON.parse(assetLinksContent({ packageName: '  ', certSha256: 'AA:BB:CC' }))).toEqual([]);
  });
});
