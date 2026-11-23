import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AccessibleDialog } from '@/components/ui/AccessibleDialog';
import { FamilyProfileForm } from '@/components/FamilyProfileForm';
import { SettingsModal } from '@/components/SettingsModal';
import { ScienceExplainerModal } from '@/components/ScienceExplainerModal';
import { SchoolSafetyAdvisoryModal } from '@/components/SchoolSafetyAdvisoryModal';

describe('AVIR Step 21: Accessibility and Inclusive Interaction (WCAG 2.2 AA Compliance - UX31-UX50)', () => {
  it('1. AccessibleDialog establishes proper WAI-ARIA dialog semantics with labelledby and describedby', () => {
    const handleClose = vi.fn();
    const html = ReactDOMServer.renderToString(
      <AccessibleDialog
        isOpen={true}
        onClose={handleClose}
        title="Diagnostic Air Inspection"
        description="Detailed verification of ambient sensor accuracy"
      >
        <p>Dialog body content</p>
      </AccessibleDialog>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="accessible-dialog-title"');
    expect(html).toContain('aria-describedby="accessible-dialog-desc"');
    expect(html).toContain('id="accessible-dialog-title"');
    expect(html).toContain('id="accessible-dialog-desc"');
    expect(html).toContain('aria-label="Close dialog"');
  });

  it('2. Secondary modals (SettingsModal, ScienceExplainerModal, SchoolSafetyAdvisoryModal) provide accessible dialog roles', () => {
    const settingsHtml = ReactDOMServer.renderToString(
      <SettingsModal
        isOpen={true}
        onClose={() => {}}
        geminiApiKey=""
        onSaveKey={() => {}}
      />
    );
    expect(settingsHtml).toContain('role="dialog"');
    expect(settingsHtml).toContain('aria-modal="true"');
    expect(settingsHtml).toContain('aria-labelledby="settings-title"');

    const scienceHtml = ReactDOMServer.renderToString(
      <ScienceExplainerModal
        isOpen={true}
        onClose={() => {}}
      />
    );
    expect(scienceHtml).toContain('role="dialog"');
    expect(scienceHtml).toContain('aria-modal="true"');
    expect(scienceHtml).toContain('aria-labelledby="science-modal-title"');

    const schoolHtml = ReactDOMServer.renderToString(
      <SchoolSafetyAdvisoryModal
        isOpen={true}
        onClose={() => {}}
        cityName="Delhi"
        usAqi={175}
        pm25={102}
      />
    );
    expect(schoolHtml).toContain('role="dialog"');
    expect(schoolHtml).toContain('aria-modal="true"');
    expect(schoolHtml).toContain('aria-labelledby="school-modal-title"');
  });

  it('3. FamilyProfileForm includes explicit label associations and accessible slider range values', () => {
    const mockProfile = {
      ageGroup: 'adult' as const,
      hasAsthmaOrRespiratory: false,
      hasCardiovascularCondition: false,
      isPregnant: false,
      isOutdoorWorker: false,
    };

    const html = ReactDOMServer.renderToString(
      <FamilyProfileForm
        profile={mockProfile}
        onChangeProfile={() => {}}
        roomSizeSqFt={300}
        onChangeRoomSize={() => {}}
        customRoutine="Morning Jog"
        onChangeCustomRoutine={() => {}}
        onSubmit={() => {}}
        isLoading={false}
      />
    );

    // Grouping for archetype
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="household-archetype-label"');
    expect(html).toContain('aria-pressed="true"');

    // Room size range slider accessibility attributes
    expect(html).toContain('id="room-size-range"');
    expect(html).toContain('aria-label="Target enclosure size in square feet"');
    expect(html).toContain('aria-valuemin="80"');
    expect(html).toContain('aria-valuemax="600"');
    expect(html).toContain('aria-valuenow="300"');
    expect(html).toContain('aria-valuetext="300 square feet, approximately 75 cubic meters"');

    // Routine text input association
    expect(html).toContain('for="custom-routine-input"');
    expect(html).toContain('id="custom-routine-input"');
  });
});
