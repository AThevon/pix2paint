# Persistence

## IndexedDB

Database: `pix2paint`, version 1, store: `projects`.

Uses raw IndexedDB API (no library). Each project stores:

```typescript
interface Project {
  id: string;          // crypto.randomUUID()
  name: string;        // "Project DD/MM"
  createdAt: number;   // timestamp
  updatedAt: number;   // timestamp
  imageBlob: Blob;     // original uploaded image
  thumbnail: Blob;     // 120px max side PNG
  settings: ProjectSettings;
}
```

## Operations (`src/lib/db.ts`)

- `saveProject(project)` — put (insert or update)
- `getProject(id)` — get by key
- `listProjects()` — getAll, sorted by `updatedAt` desc
- `deleteProject(id)` — delete by key
- `generateId()` — `crypto.randomUUID()`

Each operation opens a fresh connection, runs one transaction, closes the DB. Simple and stateless.

## Auto-Save

In `editor.ts`, settings changes trigger a debounced save (1500ms):
1. Copy current settings to project
2. Update `updatedAt` timestamp
3. `saveProject(project)`

## Backwards Compatibility

When loading a project, settings are merged: `{ ...DEFAULT_SETTINGS, ...project.settings }`. This ensures old projects (created before smooth mode) get sensible defaults for new fields like `mode`, `detailLevel`, `contourThickness`.
