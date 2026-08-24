type Task = () => Promise<void>;

const queue: Task[] = [];
let running = false;

const PACE_MIN_MS = parseInt(process.env.PACE_MIN_MS || '5000', 10);
const PACE_MAX_MS = parseInt(process.env.PACE_MAX_MS || '10000', 10);

function paceDelay(): number {
  return PACE_MIN_MS + Math.floor(Math.random() * (PACE_MAX_MS - PACE_MIN_MS));
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try {
        await task();
      } catch (err) {
        console.error('[queue] task crashed:', err);
      }
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, paceDelay()));
      }
    }
  } finally {
    running = false;
  }
}

export function enqueue(task: Task): void {
  queue.push(task);
  void pump();
}

export function queueDepth(): number {
  return queue.length;
}
