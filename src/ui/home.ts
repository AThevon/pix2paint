import { listProjects, deleteProject, generateId, saveProject } from '../lib/db';
import { generateThumbnail } from '../lib/engine';
import type { Project } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

// --- SVG Icons ---

const iconUpload = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 16V8"/>
  <path d="M8 12l4-4 4 4"/>
  <path d="M20 16.7A4.5 4.5 0 0 0 17.5 8h-1.1A7 7 0 1 0 4 14.9"/>
</svg>`;

const iconGrid = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="6" height="6"/>
  <rect x="9" y="3" width="6" height="6"/>
  <rect x="15" y="3" width="6" height="6"/>
  <rect x="3" y="9" width="6" height="6"/>
  <rect x="9" y="9" width="6" height="6"/>
  <rect x="15" y="9" width="6" height="6"/>
  <rect x="3" y="15" width="6" height="6"/>
  <rect x="9" y="15" width="6" height="6"/>
  <rect x="15" y="15" width="6" height="6"/>
</svg>`;

const iconPaint = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4z"/>
  <path d="M9 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h4z"/>
</svg>`;

const iconArrow = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 12h14"/>
  <path d="M13 6l6 6-6 6"/>
</svg>`;

const iconUploadCloud = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 16V8"/>
  <path d="M8 12l4-4 4 4"/>
  <path d="M20 16.7A4.5 4.5 0 0 0 17.5 8h-1.1A7 7 0 1 0 4 14.9"/>
</svg>`;

const iconTrash = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
  <path d="M10 11v6"/>
  <path d="M14 11v6"/>
  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
</svg>`;

// --- Helpers ---

function relativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function shortDate(): string {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function projectCard(project: Project): string {
  const thumbUrl = URL.createObjectURL(project.thumbnail);
  return `
    <div class="project-card" data-id="${project.id}">
      <div class="project-card-thumb">
        <img src="${thumbUrl}" alt="${project.name}" loading="lazy">
      </div>
      <div class="project-card-info">
        <span class="project-card-name">${project.name}</span>
        <span class="project-card-date">${relativeDate(project.updatedAt)}</span>
      </div>
      <button class="project-card-delete" data-delete-id="${project.id}" title="Delete">
        ${iconTrash}
      </button>
    </div>
  `;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// --- Main render ---

export async function renderHome(app: HTMLElement, onOpenEditor: (projectId?: string) => void) {
  const projects = await listProjects();

  app.innerHTML = `
    <div class="home">
      <main class="home-main">
        <section class="hero">
          <div class="hero-brand anim-fade-up">
            <img src="/pix2paint.png" alt="Pix2Paint" width="64" height="64" class="hero-logo">
            <h1 class="hero-name">Pix2Paint</h1>
          </div>
          <h2 class="hero-title anim-fade-up anim-delay-1">Turn any image<br>into a paint by numbers</h2>
          <p class="hero-subtitle anim-fade-up anim-delay-2">
            Want to paint something cool but don't feel like drawing?
            Drop your image, we pixelate it, number every color,
            and you just paint.
          </p>

          <div class="steps anim-fade-up anim-delay-3">
            <div class="step">
              <div class="step-icon">${iconUpload}</div>
              <div class="step-label">Upload your image</div>
            </div>
            <div class="step-arrow">${iconArrow}</div>
            <div class="step">
              <div class="step-icon">${iconGrid}</div>
              <div class="step-label">We pixelate it</div>
            </div>
            <div class="step-arrow">${iconArrow}</div>
            <div class="step">
              <div class="step-icon">${iconPaint}</div>
              <div class="step-label">You paint!</div>
            </div>
          </div>

          <div class="dropzone anim-fade-up-dropzone" id="dropzone">
            <input type="file" id="file-input" accept="image/*" class="sr-only">
            <div class="dropzone-content">
              ${iconUploadCloud}
              <p>Drop your image here</p>
              <span>or</span>
              <label for="file-input" class="btn btn-primary">Choose a file</label>
            </div>
          </div>
        </section>

        ${projects.length > 0 ? `
          <section class="projects-section anim-fade-up anim-delay-5">
            <h3 class="projects-title">Your projects</h3>
            <div class="projects-grid" id="projects-grid">
              ${projects.map(p => projectCard(p)).join('')}
            </div>
          </section>
        ` : ''}
      </main>

      <footer class="home-footer anim-fade-up anim-delay-5">
        <p>Pix2Paint — Free, no sign-up, 100% in your browser</p>
      </footer>
    </div>
  `;

  // --- Event listeners ---

  const dropzone = document.getElementById('dropzone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  // After fade-up completes: set opacity explicitly so hover's animation:none won't reset it
  dropzone.addEventListener('animationend', () => {
    dropzone.style.opacity = '1';
    dropzone.style.transform = 'translateY(0)';
    dropzone.classList.remove('anim-fade-up-dropzone');
  }, { once: true });

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;

    const blob = new Blob([file], { type: file.type });
    const img = await loadImage(blob);
    const thumbnail = await generateThumbnail(img);

    const project: Project = {
      id: generateId(),
      name: `Project ${shortDate()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      imageBlob: blob,
      thumbnail,
      settings: { ...DEFAULT_SETTINGS },
    };

    await saveProject(project);
    onOpenEditor(project.id);
  }

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  // File input
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  // Project cards — click to open
  const cards = app.querySelectorAll<HTMLElement>('.project-card');
  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      // Ignore click on delete button
      if ((e.target as HTMLElement).closest('.project-card-delete')) return;
      const id = card.dataset.id;
      if (id) onOpenEditor(id);
    });
  });

  // Delete buttons
  const deleteBtns = app.querySelectorAll<HTMLElement>('.project-card-delete');
  deleteBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (!id) return;
      await deleteProject(id);
      // Re-render
      await renderHome(app, onOpenEditor);
    });
  });
}
