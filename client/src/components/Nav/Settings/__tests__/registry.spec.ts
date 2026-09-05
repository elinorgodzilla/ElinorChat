import { isValidElementType } from 'react-is';
import { SettingsTabValues } from 'librechat-data-provider';
import { FontFamilySetting, FontWeightSetting } from '../../SettingsTabs/General/Typography';
import en from '~/locales/en/translation.json';
import { matchesQuery } from '../search';
import { registry } from '../registry';
import { TABS } from '../types';

const validTabSections = new Map(TABS.map((t) => [t.id, new Set(t.sections.map((s) => s.id))]));

describe('settings registry', () => {
  it('has unique ids', () => {
    const ids = registry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references a valid tab and section for every entry', () => {
    for (const entry of registry) {
      const sections = validTabSections.get(entry.tab);
      expect(sections).toBeDefined();
      expect(sections!.has(entry.section)).toBe(true);
    }
  });

  it('uses label keys that exist in the English locale', () => {
    for (const entry of registry) {
      expect(en).toHaveProperty(entry.labelKey);
    }
  });

  it('has a renderable Component for every entry', () => {
    for (const entry of registry) {
      expect(isValidElementType(entry.Component)).toBe(true);
    }
  });

  it('places typography controls beside font size in General Appearance', () => {
    const fontSizeIndex = registry.findIndex((entry) => entry.id === 'fontSize');
    expect(registry.slice(fontSizeIndex + 1, fontSizeIndex + 3)).toEqual([
      expect.objectContaining({
        id: 'fontFamily',
        tab: SettingsTabValues.GENERAL,
        section: 'appearance',
        Component: FontFamilySetting,
      }),
      expect.objectContaining({
        id: 'fontWeight',
        tab: SettingsTabValues.GENERAL,
        section: 'appearance',
        Component: FontWeightSetting,
      }),
    ]);
  });

  it.each([
    ['font family', 'fontFamily'],
    ['typeface', 'fontFamily'],
    ['Inter', 'fontFamily'],
    ['Source Sans 3', 'fontFamily'],
    ['System', 'fontFamily'],
    ['Segoe UI', 'fontFamily'],
    ['Jost', 'fontFamily'],
    ['Readex Pro', 'fontFamily'],
    ['base font weight', 'fontWeight'],
    ['light', 'fontWeight'],
    ['regular', 'fontWeight'],
    ['medium', 'fontWeight'],
    ['300', 'fontWeight'],
    ['400', 'fontWeight'],
    ['500', 'fontWeight'],
    ['thickness', 'fontWeight'],
    ['typography', 'fontFamily'],
    ['typography', 'fontWeight'],
  ])('finds %s in the registered %s search terms', (query, id) => {
    const results = registry.filter((entry) =>
      matchesQuery(query, { label: en[entry.labelKey], keywords: entry.keywords }),
    );
    expect(results.map((entry) => entry.id)).toContain(id);
  });
});
