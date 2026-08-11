# App icons — files to drop in

`public/manifest.json` and the `apple-touch-icon` link in `src/app/layout.tsx`
already reference these four paths. **They do not exist yet.** A manifest entry
pointing at a 404 is not an error — the browser falls back to `/favicon.ico`,
which is what happens today — so the install works either way; it just looks
like a stretched 64px favicon on the home screen, which is the thing an iOS
driver sees before they trust the app enough to grant push permission.

Drop these in and nothing else needs to change:

| File | Size | Purpose |
| --- | --- | --- |
| `icon-192.png` | 192×192 | Android home screen, `purpose: any` |
| `icon-512.png` | 512×512 | Splash screen and store listings, `purpose: any` |
| `icon-maskable-512.png` | 512×512 | Android adaptive icon, `purpose: maskable` |
| `apple-touch-icon.png` | 180×180 | iOS home screen (referenced from `layout.tsx`) |

## The two rules that actually matter

**Maskable is not the same image at a different size.** Android crops it to a
circle, squircle, teardrop or rounded square depending on the launcher, so the
logo has to sit inside the **safe zone**: a centred circle of 409px diameter on
a 512px canvas (80%). Everything outside it will be cut on some device. Fill the
full canvas with the background colour — transparent corners get clipped to
black on several launchers. Check it against
<https://maskable.app/editor> before shipping.

**iOS ignores the manifest for the home-screen icon.** It reads
`apple-touch-icon` only, it does not apply a mask, and it does not respect
transparency — an alpha channel composites against black. Ship it square,
opaque, 180×180, with the corner rounding left to iOS.

Background colour to match the app shell: `#09090b` (matches `background_color`
and `theme_color` in the manifest, and the `--background` token in dark mode).

After adding the files, verify with Chrome DevTools → Application → Manifest,
which lists every icon it could and couldn't load.
