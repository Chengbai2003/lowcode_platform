export function compareLogicKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function pushMinHeap(heap: string[], key: string): void {
  let index = heap.length;
  heap.push(key);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareLogicKeys(heap[parent], key) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = key;
}

export function popMinHeap(heap: string[]): string | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (first === undefined || last === undefined || heap.length === 0) return first;

  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const smaller =
      right < heap.length && compareLogicKeys(heap[right], heap[left]) < 0 ? right : left;
    if (compareLogicKeys(last, heap[smaller]) <= 0) break;
    heap[index] = heap[smaller];
    index = smaller;
  }
  heap[index] = last;
  return first;
}
