export async function mapWithConcurrency(items = [], limit = 1, worker = async item => item, {
  shouldStop = () => false,
} = {}) {
  const source = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(limit) || 1);
  const results = new Array(source.length);
  let cursor = 0;

  async function runWorker() {
    while (!shouldStop()) {
      const index = cursor;
      cursor += 1;
      if (index >= source.length) return;
      try {
        results[index] = await worker(source[index], index);
      } catch (error) {
        results[index] = undefined;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, source.length) }, runWorker));
  return results;
}
