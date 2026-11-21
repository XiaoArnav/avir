import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Accessibility (a11y) & WCAG 2.1 AA Compliance', () => {
  it('includes an accessible skip-link in the root layout', () => {
    const layoutPath = path.resolve(__dirname, '../../src/app/layout.tsx');
    const layoutCode = fs.readFileSync(layoutPath, 'utf-8');

    expect(layoutCode).toContain('href="#main-content"');
    expect(layoutCode).toContain('sr-only focus:not-sr-only');
    expect(layoutCode).toContain('Skip to main content');
  });

  it('declares semantic landmarks (<header>, <main>, <footer>, <section>) across pages', () => {
    const pagePath = path.resolve(__dirname, '../../src/app/page.tsx');
    const pageCode = fs.readFileSync(pagePath, 'utf-8');

    expect(pageCode).toContain('<main id="main-content"');
    expect(pageCode).toContain('<footer');
  });

  it('features ARIA live regions and role="alert" for dynamic atmospheric warnings', () => {
    const heroPath = path.resolve(__dirname, '../../src/components/AtmosphereHero.tsx');
    const heroCode = fs.readFileSync(heroPath, 'utf-8');

    expect(heroCode).toContain('role="alert"');
    expect(heroCode).toContain('aria-live="polite"');
  });

  it('supports modal accessibility with role="dialog", aria-modal="true", and aria-labelledby', () => {
    const modalPath = path.resolve(__dirname, '../../src/components/SettingsModal.tsx');
    const modalCode = fs.readFileSync(modalPath, 'utf-8');

    expect(modalCode).toContain('role="dialog"');
    expect(modalCode).toContain('aria-modal="true"');
    expect(modalCode).toContain('aria-labelledby="settings-title"');
  });

  it('implements prefers-reduced-motion media query and visible focus-visible rings in CSS', () => {
    const cssPath = path.resolve(__dirname, '../../src/app/globals.css');
    const cssCode = fs.readFileSync(cssPath, 'utf-8');

    expect(cssCode).toContain(':focus-visible');
    expect(cssCode).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
