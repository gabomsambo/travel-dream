import {
  applyVerdict,
  dreamsFromHistory,
  finishEarly,
  isDeckComplete,
  undoVerdict,
  dreamIdsToAdd,
  type ShuffleSession,
} from '@/lib/explore/shuffle-session';

const empty = (): ShuffleSession => ({ index: 0, history: [], finishedEarly: false });

describe('shuffle session', () => {
  it('tracks dreams and completion', () => {
    let session = empty();
    session = applyVerdict(session, 'a', 'dream');
    session = applyVerdict(session, 'b', 'next');
    expect(dreamsFromHistory(session.history)).toEqual(['a']);
    expect(isDeckComplete(session, 3)).toBe(false);
    session = applyVerdict(session, 'c', 'next');
    expect(isDeckComplete(session, 3)).toBe(true);
  });

  it('finish early shows end state with dreams kept so far', () => {
    let session = empty();
    for (let i = 0; i < 5; i++) session = applyVerdict(session, `p${i}`, i % 2 === 0 ? 'dream' : 'next');
    session = finishEarly(session);
    expect(isDeckComplete(session, 100)).toBe(true);
    expect(dreamsFromHistory(session.history)).toEqual(['p0', 'p2', 'p4']);
    expect(session.index).toBe(5);
  });

  it('filters dream ids already in a collection before add', () => {
    expect(dreamIdsToAdd(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
    expect(dreamIdsToAdd(['a'], ['a'])).toEqual([]);
  });

  it('undo walks back one verdict', () => {
    let session = empty();
    session = applyVerdict(session, 'a', 'dream');
    session = applyVerdict(session, 'b', 'next');
    const undone = undoVerdict(session);
    expect(undone?.history).toHaveLength(1);
    expect(undone?.index).toBe(1);
    expect(dreamsFromHistory(undone!.history)).toEqual(['a']);
  });
});
