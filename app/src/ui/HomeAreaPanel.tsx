// Settings panel "Where we live" (D-22). The area is saved on this phone only (settings.homeArea)
// and is used just to sort restaurants nearest first. A position found with "Use my location" is
// rounded to 3 decimals (about 100 m) and labelled "My location"; the old area is kept whenever
// the phone says no.
import { useState } from 'react';
import { I8_MARKAZ, round3, validLatLng } from '../domain/geo';
import type { KitchenData } from '../domain/types';

type HomeArea = NonNullable<KitchenData['settings']['homeArea']>;

export interface HomeAreaPanelProps {
  homeArea: HomeArea | undefined;
  onChange: (patch: { homeArea: HomeArea | undefined }) => void;
}

const WHY = 'Your phone will ask to share your location. It is used here to sort restaurants nearest first, and the result is kept on this phone only.';

export function HomeAreaPanel({ homeArea, onChange }: HomeAreaPanelProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  function useI8() {
    onChange({ homeArea: { label: I8_MARKAZ.label, lat: I8_MARKAZ.lat, lng: I8_MARKAZ.lng } });
    setNote(`Saved: ${I8_MARKAZ.label}.`);
  }

  function useMine() {
    setNote('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNote('This phone cannot share a location here. Your area was not changed.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setBusy(false);
        const at = validLatLng(round3(pos.coords.latitude), round3(pos.coords.longitude));
        if (!at) { setNote('The phone gave a place that does not look right. Your area was not changed.'); return; }
        onChange({ homeArea: { label: 'My location', lat: at.lat, lng: at.lng } });
        setNote('Saved: My location.');
      },
      err => {
        setBusy(false);
        setNote(
          err.code === 1 ? 'Location was not allowed, so your area was not changed. You can allow it in the phone or browser settings, or pick I-8 Markaz.'
          : err.code === 3 ? 'The phone took too long to find you. Your area was not changed. Try again outside or pick I-8 Markaz.'
          : 'The phone could not find your location. Your area was not changed.',
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  }

  function clear() {
    onChange({ homeArea: undefined });
    setNote('Area cleared.');
  }

  return (
    <section className="panel settings__panel homearea" aria-labelledby="set-home">
      <h2 id="set-home" className="panel__title">Where we live</h2>
      <p className="homearea__now" role="status">
        {homeArea ? <>Nearest restaurants are measured from <strong>{homeArea.label}</strong>.</> : 'No area chosen yet. Pick one to see the nearest restaurants first.'}
      </p>
      <button type="button" className="button-primary homearea__big" onClick={useI8}>{I8_MARKAZ.label}</button>
      <p className="homearea__why">{WHY}</p>
      <div className="choice-grid choice-grid--2">
        <button type="button" className="button-tint" disabled={busy} onClick={useMine}>{busy ? 'Finding you...' : 'Use my location'}</button>
        <button type="button" className="button-outline" disabled={!homeArea} onClick={clear}>Clear</button>
      </div>
      {note && <p className="homearea__note" role="status">{note}</p>}
    </section>
  );
}
