import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  duration,
  easing,
  springs,
  motionVariants,
} from '@/lib/motion-tokens';
import {
  MotionProvider,
  FadeIn,
  SlideUp,
  StaggerContainer,
  StaggerItem,
  SpringCard,
  ValueCrossfade,
} from '@/components/motion';

describe('Motion Design System & Tokens (Stage 1 Foundations)', () => {
  describe('Motion Tokens Contract', () => {
    it('1. Provides expected duration tokens within UX thresholds', () => {
      expect(duration.fast).toBeLessThanOrEqual(0.2);
      expect(duration.base).toBeGreaterThanOrEqual(0.2);
      expect(duration.base).toBeLessThanOrEqual(0.35);
      expect(duration.smooth).toBeGreaterThan(0.35);
      expect(duration.slow).toBeGreaterThan(duration.smooth);
    });

    it('2. Exports valid Apple/Linear easing cubic-bezier curves', () => {
      expect(easing.apple).toEqual([0.16, 1, 0.3, 1]);
      expect(easing.apple.length).toBe(4);
      expect(easing.easeOutQuart.length).toBe(4);
    });

    it('3. Exports spring presets for snappy, gentle, bouncy, and atmospheric motion', () => {
      expect(springs.snappy.type).toBe('spring');
      expect((springs.snappy as unknown as Record<string, unknown>).stiffness).toBeGreaterThan(300);
      expect(springs.gentle.type).toBe('spring');
      expect((springs.gentle as unknown as Record<string, unknown>).damping).toBeDefined();
      expect(springs.bouncy.type).toBe('spring');
      expect(springs.atmospheric.type).toBe('spring');
    });

    it('4. Contains variants for fadeIn, fadeUp, modalContent, and stagger', () => {
      expect(motionVariants.fadeIn).toBeDefined();
      expect(motionVariants.fadeUp).toBeDefined();
      expect(motionVariants.modalContent).toBeDefined();
      expect(motionVariants.staggerContainer).toBeDefined();
      expect(motionVariants.staggerItem).toBeDefined();
    });
  });

  describe('Motion Primitives Component Rendering', () => {
    it('5. MotionProvider renders children with MotionConfig wrapper', () => {
      const html = ReactDOMServer.renderToString(
        <MotionProvider>
          <div data-testid="child-element">Test Motion Content</div>
        </MotionProvider>
      );
      expect(html).toContain('Test Motion Content');
      expect(html).toContain('data-testid="child-element"');
    });

    it('6. FadeIn component renders children with custom direction and class names', () => {
      const html = ReactDOMServer.renderToString(
        <FadeIn direction="up" delay={0.1} className="test-fade-class">
          <span>Atmospheric Header</span>
        </FadeIn>
      );
      expect(html).toContain('Atmospheric Header');
      expect(html).toContain('test-fade-class');
    });

    it('7. SlideUp component renders children cleanly', () => {
      const html = ReactDOMServer.renderToString(
        <SlideUp distance={20} className="slide-card">
          <p>Hazardous Air Quality Warning</p>
        </SlideUp>
      );
      expect(html).toContain('Hazardous Air Quality Warning');
      expect(html).toContain('slide-card');
    });

    it('8. StaggerContainer and StaggerItem render children with hierarchy', () => {
      const html = ReactDOMServer.renderToString(
        <StaggerContainer className="station-grid">
          <StaggerItem className="station-item-1">
            <span>Anand Vihar</span>
          </StaggerItem>
          <StaggerItem className="station-item-2">
            <span>ITO</span>
          </StaggerItem>
        </StaggerContainer>
      );
      expect(html).toContain('station-grid');
      expect(html).toContain('station-item-1');
      expect(html).toContain('Anand Vihar');
      expect(html).toContain('station-item-2');
      expect(html).toContain('ITO');
    });

    it('9. SpringCard renders with glass-panel styling and interactive semantics', () => {
      const html = ReactDOMServer.renderToString(
        <SpringCard elevation="prominent" role="button" tabIndex={0} className="custom-card">
          <h4>Filter Life Remaining</h4>
          <p>84%</p>
        </SpringCard>
      );
      expect(html).toContain('glass-panel');
      expect(html).toContain('shadow-2xl');
      expect(html).toContain('role="button"');
      expect(html).toContain('Filter Life Remaining');
      expect(html).toContain('84%');
    });

    it('10. ValueCrossfade renders authentic numbers without synthetic tickers', () => {
      const html = ReactDOMServer.renderToString(
        <ValueCrossfade value={384} valueKey="pm25-aqi" className="aqi-display" />
      );
      expect(html).toContain('384');
      expect(html).toContain('tabular-nums');
      expect(html).toContain('aqi-display');
    });

    it('11. ValueCrossfade renders text states (e.g. Severe, Stale, Loading)', () => {
      const html = ReactDOMServer.renderToString(
        <ValueCrossfade value="Severe+" valueKey="cat-severe" />
      );
      expect(html).toContain('Severe+');
    });
  });
});
