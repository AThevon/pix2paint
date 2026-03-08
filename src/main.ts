import './style.css';
import { renderHome } from './ui/home';
import { renderEditor } from './ui/editor';

function getRoute(): { view: 'home' | 'editor'; projectId?: string } {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project');
  return projectId ? { view: 'editor', projectId } : { view: 'home' };
}

function navigate(projectId?: string) {
  if (projectId) {
    window.history.pushState({}, '', `?project=${projectId}`);
  } else {
    window.history.pushState({}, '', '/');
  }
  render();
}

async function render() {
  const app = document.getElementById('app')!;
  const route = getRoute();

  if (route.view === 'editor' && route.projectId) {
    await renderEditor(app, route.projectId, () => navigate());
  } else {
    await renderHome(app, navigate);
  }
}

window.addEventListener('popstate', () => render());
render();
