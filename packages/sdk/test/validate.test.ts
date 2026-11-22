import { describe, expect, it } from 'vitest';
import { parseWalkthrough } from '../src/validate';
import { step, walkthrough } from './fixtures';

describe('parseWalkthrough', () => {
  it('accepts a valid walkthrough', () => {
    expect(parseWalkthrough(walkthrough([step()])).steps).toHaveLength(1);
  });
  it('rejects steps without evidence', () => {
    expect(() => parseWalkthrough(walkthrough([step({ evidence: [] })]))).toThrow(/evidence/);
  });
  it('rejects ok status with no steps', () => {
    expect(() => parseWalkthrough(walkthrough([]))).toThrow();
  });
  it('rejects insufficient_evidence carrying steps', () => {
    expect(() => parseWalkthrough(walkthrough([step()], { status: 'insufficient_evidence' }))).toThrow();
  });
  it('rejects bad action and non-objects', () => {
    expect(() => parseWalkthrough(walkthrough([step({ action: 'hack' as never })]))).toThrow(/action/);
    expect(() => parseWalkthrough(null)).toThrow();
  });

  describe('suggestions', () => {
    const insufficient = (suggestions: unknown) =>
      parseWalkthrough({ ...walkthrough([], { status: 'insufficient_evidence', message: 'not covered' }), suggestions });
    it('keeps well-formed suggestions on insufficient_evidence', () => {
      const wt = insufficient([{ workflowId: 'w1', title: ' Add a song to favourites ' }, { workflowId: 'w2', title: 'Create a playlist' }]);
      expect(wt.suggestions).toEqual([{ workflowId: 'w1', title: 'Add a song to favourites' }, { workflowId: 'w2', title: 'Create a playlist' }]);
    });
    it('drops malformed, over-long and duplicate entries and caps the list at 5', () => {
      const many = Array.from({ length: 8 }, (_, i) => ({ workflowId: `w${i}`, title: `Guide ${i}` }));
      const wt = insufficient([null, 'x', { workflowId: 'a' }, { workflowId: '', title: 'No id' }, { workflowId: 'b', title: 'x'.repeat(201) },
        { workflowId: 'c', title: '   ' }, { workflowId: 'd', title: 'Same' }, { workflowId: 'e', title: 'Same' }, ...many]);
      expect(wt.suggestions).toHaveLength(5);
      expect(wt.suggestions![0]).toEqual({ workflowId: 'd', title: 'Same' });
      expect(wt.suggestions!.map((s) => s.title)).not.toContain('x'.repeat(201));
    });
    it('treats a non-array or empty field as no suggestions', () => {
      expect(insufficient('nope').suggestions).toBeUndefined();
      expect(insufficient([]).suggestions).toBeUndefined();
    });
    it('ignores suggestions on an ok walkthrough', () => {
      const wt = parseWalkthrough({ ...walkthrough([step()]), suggestions: [{ workflowId: 'w', title: 'T' }] });
      expect(wt.suggestions).toBeUndefined();
    });
  });
});
