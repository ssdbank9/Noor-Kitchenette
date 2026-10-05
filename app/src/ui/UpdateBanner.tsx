import { useState, useSyncExternalStore } from 'react';
import { applyUpdate, subscribeUpdate, updateWaiting } from '../lib/appUpdate';
import { canUpdateNow } from '../lib/canUpdateNow';
import type { SaveQueue } from '../storage/saveQueue';

/** "A new version is ready". Update first makes sure everything is saved; it never reloads on its own. */
export function UpdateBanner({ queue }: { queue: SaveQueue<unknown> }) {
  const waiting = useSyncExternalStore(subscribeUpdate, updateWaiting);
  const [message, setMessage] = useState('');
  if (!waiting) return null;

  async function update() {
    if (!canUpdateNow(queue.getState())) {
      setMessage('Saving your changes first...');
      await queue.retry();
    }
    if (canUpdateNow(queue.getState())) {
      await applyUpdate();
    } else {
      setMessage('Your changes are not saved yet. Fix that first, then update.');
    }
  }

  return (
    <div className="update-banner" role="status">
      <span>{message || 'A new version is ready'}</span>
      <button type="button" onClick={() => void update()}>Update</button>
    </div>
  );
}
