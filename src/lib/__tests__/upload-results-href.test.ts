import { anythingLeftInUpload, uploadResultsHref } from '@/lib/upload-sheet';

const empty = {
  rows: {
    toReview: { places: [] },
    noPlaceFound: { sourceIds: [] },
    couldNotRead: { sourceIds: [] },
    stillReading: { sourceIds: [] },
  },
};

describe('upload results destination', () => {
  it('stays on that upload while anything is left', () => {
    expect(uploadResultsHref('ses 1', true)).toBe('/inbox?upload=ses%201');
    expect(anythingLeftInUpload({
      rows: { ...empty.rows, toReview: { places: [{ id: 'p' }] } },
    })).toBe(true);
    expect(anythingLeftInUpload({
      rows: { ...empty.rows, noPlaceFound: { sourceIds: ['s'] } },
    })).toBe(true);
    expect(anythingLeftInUpload({
      rows: { ...empty.rows, couldNotRead: { sourceIds: ['s'] } },
    })).toBe(true);
  });

  it('goes to the Library only when the upload is finished', () => {
    expect(anythingLeftInUpload(empty)).toBe(false);
    expect(uploadResultsHref('ses_1', false)).toBe('/library');
  });

  it('does not send an unknown upload to the Library', () => {
    expect(anythingLeftInUpload(undefined)).toBe(true);
  });
});
