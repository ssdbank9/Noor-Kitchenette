import { formatHouseholdDay, HOUSEHOLD_TIME_ZONE } from './lib/localDate';

export function App() {
  const today = formatHouseholdDay(new Date(), HOUSEHOLD_TIME_ZONE);
  return (
    <main className="shell">
      <header>
        <div className="eyebrow">{today}</div>
        <h1 className="title">Assalam-o-alaikum, Noor</h1>
      </header>
      <section className="card" aria-label="Status">
        <p style={{ margin: 0, fontWeight: 700 }}>Your kitchen app is being set up. Recipes and pantry arrive next.</p>
      </section>
    </main>
  );
}
