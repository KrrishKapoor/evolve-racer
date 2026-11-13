import './styles/tokens.css';
import './styles/base.css';
import { mountHero } from './hero';
import { mountSections } from './sections';

function setupTheme(): void {
  const btn = document.getElementById('theme-toggle')!;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (document.documentElement.dataset.theme ?? (dark.matches ? 'dark' : 'light')) === 'dark';
  const sync = () => btn.setAttribute('aria-pressed', String(isDark()));
  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private mode: the choice just will not persist.
    }
    sync();
    window.dispatchEvent(new Event('themechange'));
  });
  dark.addEventListener('change', sync);
  sync();
}

setupTheme();
mountHero(document.getElementById('hero-stage')!);
mountSections(document.getElementById('sections')!);
