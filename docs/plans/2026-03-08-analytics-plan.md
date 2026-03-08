# Analytics & Monitoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add analytics and error monitoring to understand user behavior before deciding on a monetization strategy. The app stays 100% free — no paywall, no watermark, no limit. We collect data first, decide later.

**Stack:**
- **Umami** (cloud, free tier — 1M events/mois) — privacy-friendly analytics, no cookies, GDPR-safe
- **Sentry** (@sentry/browser, free tier — 5K errors/mois) — error monitoring
- **web-vitals** — lightweight Core Web Vitals tracking (optional, if Vercel Analytics not available)

**Principles:**
- Zero cookies, zero bannière GDPR
- Wrapper module `analytics.ts` to centralize all tracking (swap provider = 1 file change)
- Events are fire-and-forget, never block UI
- No tracking of image content or personal data

---

## Events to track

### Priority 1 — Funnel (upload → export)

| Event | Location | Data |
|-------|----------|------|
| `page_view` | main.ts router | route: home / editor |
| `image_uploaded` | home.ts handleFile() | file_size_kb, file_type, width, height |
| `project_opened` | editor.ts renderEditor() | is_new (bool) |
| `export_triggered` | editor.ts onExport() | mode (numbers/grouped/none), palette_size, image_width, image_height |
| `project_deleted` | home.ts delete handler | — |

### Priority 2 — Usage patterns

| Event | Location | Data |
|-------|----------|------|
| `mode_switched` | toolbar.ts mode buttons | from, to (pixel/smooth) |
| `setting_changed` | toolbar.ts slider callbacks (debounced) | setting_name, value |
| `display_changed` | toolbar.ts toggle callbacks | setting_name (colored/white/numbers/grouped), value |
| `sidebar_toggled` | sidebar.ts toggle | open (bool) |
| `zoom_action` | toolbar.ts + canvas.ts | type (fit/1to1/scroll), zoom_level |

### Priority 3 — Performance & health

| Event | Location | Data |
|-------|----------|------|
| `processing_completed` | editor.ts process() | duration_ms, pixel_count, palette_size, mode |
| `export_completed` | engine.ts export functions | duration_ms, output_size_bytes |

---

## Key metrics to watch (Umami dashboard)

**Primary funnel:**
```
Visitors → Upload image → Modify settings → Export
```

Conversion rates between steps tell us where people drop off:
- Low visit→upload = trust/UX problem on home page
- Low upload→export = result quality problem
- High export rate = value exists, monetization viable

**Secondary:**
- Most used mode (pixel vs smooth)
- Average palette size per export
- Return rate (reopened projects vs new)
- Processing time distribution

---

## Monetization ideas (PENDING — decision after data)

Nothing is implemented yet. These are ideas to validate with analytics data:

| Idea | What analytics must show to validate |
|------|-------------------------------------|
| HD export paywall (free = capped resolution, paid = full res PNG) | High export volume = people value the output |
| Color limit (free = 12, premium = 30+) | Users frequently push color slider to max |
| Custom palettes / import | Advanced usage patterns |
| PDF multi-page export (large format printing) | Large image uploads, high-res exports |
| Physical kits (print-on-demand partnership) | Enough export volume to justify a partnership |
| Ads + remove-ads premium | Enough traffic for ads to generate revenue |

**Decision timeline:** collect 2-4 weeks of data, then reassess.

---

## Tasks

### Task 1: Create analytics wrapper module

**Files:**
- Create: `src/lib/analytics.ts`

**Step 1: Create the module with track() and identify Umami global**

```typescript
declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number>) => void;
    };
  }
}

export function track(event: string, data?: Record<string, string | number>): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics should never break the app
  }
}
```

This is the only file other modules import. If we swap Umami for something else later, we change only this file.

---

### Task 2: Add Umami script to index.html

**Files:**
- Modify: `index.html`

**Step 1: Add the Umami cloud script tag**

Add before the closing `</head>`:

```html
<script defer src="https://cloud.umami.is/script.js" data-website-id="TODO_REPLACE_WITH_REAL_ID"></script>
```

No cookies, ~2KB gzipped, non-blocking (defer).

> **Note:** The website ID must be created on https://cloud.umami.is after signing up. Replace the placeholder before deploying.

---

### Task 3: Instrument Priority 1 events (funnel)

**Files:**
- Modify: `src/main.ts` — page_view on route change
- Modify: `src/ui/home.ts` — image_uploaded, project_deleted
- Modify: `src/ui/editor.ts` — project_opened, export_triggered

**Step 1: Track page_view in main.ts**

In the `navigateTo()` function or wherever the route is resolved, add:

```typescript
import { track } from './lib/analytics';
track('page_view', { route: route === 'editor' ? 'editor' : 'home' });
```

**Step 2: Track image_uploaded in home.ts**

In `handleFile()`, after the image loads successfully:

```typescript
import { track } from '../lib/analytics';
track('image_uploaded', {
  file_size_kb: Math.round(file.size / 1024),
  file_type: file.type,
  width: img.naturalWidth,
  height: img.naturalHeight,
});
```

**Step 3: Track project_opened in editor.ts**

In `renderEditor()`, after the project loads:

```typescript
track('project_opened', { is_new: isNew ? 1 : 0 });
```

(Umami data values are strings or numbers, no booleans — use 1/0.)

**Step 4: Track export_triggered in editor.ts**

In the `onExport()` callback:

```typescript
track('export_triggered', {
  mode: exportMode,
  palette_size: latestResult.palette.length,
  image_width: latestResult.width,
  image_height: latestResult.height,
});
```

**Step 5: Track project_deleted in home.ts**

In the delete button handler:

```typescript
track('project_deleted');
```

---

### Task 4: Instrument Priority 2 events (usage patterns)

**Files:**
- Modify: `src/ui/toolbar.ts` — mode_switched, setting_changed, display_changed
- Modify: `src/ui/sidebar.ts` — sidebar_toggled
- Modify: `src/ui/canvas.ts` — zoom_action

**Step 1: Track mode_switched in toolbar.ts**

When user clicks pixel/smooth mode buttons:

```typescript
track('mode_switched', { from: previousMode, to: newMode });
```

**Step 2: Track setting_changed in toolbar.ts**

In slider input handlers (after debounce resolves, not on every input tick):

```typescript
track('setting_changed', { setting: 'pixel_size', value: newValue });
```

Same pattern for tolerance, detail_level, contour_thickness sliders.

**Step 3: Track display_changed in toolbar.ts**

On colored/white toggle, numbers toggle, grouped toggle:

```typescript
track('display_changed', { setting: 'show_numbers', value: newValue ? 1 : 0 });
```

**Step 4: Track sidebar_toggled in sidebar.ts**

```typescript
track('sidebar_toggled', { open: isOpen ? 1 : 0 });
```

**Step 5: Track zoom_action in canvas.ts and toolbar.ts**

On fit-to-view and 1:1 buttons in toolbar:

```typescript
track('zoom_action', { type: 'fit' }); // or '1to1'
```

On scroll-to-zoom in canvas.ts (debounce this — don't fire on every wheel event, fire once after 500ms idle):

```typescript
track('zoom_action', { type: 'scroll', zoom_level: Math.round(scale * 100) });
```

---

### Task 5: Add Sentry error monitoring

**Files:**
- Modify: `package.json` — add @sentry/browser dependency
- Modify: `src/main.ts` — init Sentry at app start

**Step 1: Install Sentry**

```bash
pnpm add @sentry/browser
```

**Step 2: Init Sentry in main.ts**

At the very top of main.ts, before anything else:

```typescript
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: 'TODO_REPLACE_WITH_REAL_DSN',
  tracesSampleRate: 0.1,
  environment: import.meta.env.MODE, // 'development' or 'production'
});
```

> **Note:** Create a Sentry project at https://sentry.io and replace the DSN placeholder before deploying. Disable in dev if needed via `enabled: import.meta.env.PROD`.

---

### Task 6: Instrument Priority 3 events (performance)

**Files:**
- Modify: `src/ui/editor.ts` — processing_completed timing
- Modify: `src/lib/engine.ts` — export_completed timing

**Step 1: Track processing time in editor.ts**

Wrap the process() call with timing:

```typescript
const start = performance.now();
// ... existing worker processing ...
// In the worker onmessage callback:
const duration = Math.round(performance.now() - start);
track('processing_completed', {
  duration_ms: duration,
  pixel_count: result.width * result.height,
  palette_size: result.palette.length,
  mode: settings.mode,
});
```

**Step 2: Track export time in engine.ts or editor.ts**

Wrap the export function call:

```typescript
const start = performance.now();
const blob = await exportCanvas(/* ... */);
track('export_completed', {
  duration_ms: Math.round(performance.now() - start),
  output_size_bytes: blob.size,
});
```

---

### Task 7: Environment configuration

**Files:**
- Modify: `index.html` — conditional Umami loading
- Modify: `src/main.ts` — conditional Sentry init

**Step 1: Disable analytics in development**

In `analytics.ts`, add a dev guard:

```typescript
const IS_PROD = window.location.hostname !== 'localhost'
  && !window.location.hostname.startsWith('127.');

export function track(event: string, data?: Record<string, string | number>): void {
  if (!IS_PROD) return;
  try {
    window.umami?.track(event, data);
  } catch {
    // never break the app
  }
}
```

For Sentry, use `enabled: import.meta.env.PROD` in the init config.

---

## Post-deploy checklist

- [ ] Create Umami account on https://cloud.umami.is (free)
- [ ] Create website in Umami dashboard, get website ID
- [ ] Replace `TODO_REPLACE_WITH_REAL_ID` in index.html
- [ ] Create Sentry project at https://sentry.io (free)
- [ ] Replace `TODO_REPLACE_WITH_REAL_DSN` in main.ts
- [ ] Deploy app
- [ ] Verify events appear in Umami dashboard (test upload + export)
- [ ] Verify errors appear in Sentry (trigger a test error in console)
- [ ] Wait 2-4 weeks, analyze data, decide on monetization
