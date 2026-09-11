import { splitEmbeddingBatches } from './text.utils';

describe('splitEmbeddingBatches', () => {
  it('少量短文本合并为一批', () => {
    expect(splitEmbeddingBatches(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('超过条数上限时切批', () => {
    const texts = Array.from({ length: 35 }, (_, i) => `t${i}`);
    const batches = splitEmbeddingBatches(texts);
    expect(batches.map((b) => b.length)).toEqual([16, 16, 3]);
  });

  it('超过总字符上限时切批（边界落在整条文本上）', () => {
    const texts = ['x'.repeat(4000), 'y'.repeat(4000), 'z'.repeat(100)];
    const batches = splitEmbeddingBatches(texts);
    expect(batches).toEqual([
      ['x'.repeat(4000)],
      ['y'.repeat(4000), 'z'.repeat(100)],
    ]);
  });

  it('单条超长文本独占一批，不被截断', () => {
    const batches = splitEmbeddingBatches(['a'.repeat(9000)]);
    expect(batches).toEqual([['a'.repeat(9000)]]);
  });

  it('空输入返回空', () => {
    expect(splitEmbeddingBatches([])).toEqual([]);
  });
});
