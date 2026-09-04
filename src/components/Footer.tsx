/**
 * Attribution and disclaimer, on every tab.
 *
 * Rendered at the App level rather than per-tab: the claims are about where all
 * of this app's data comes from, which does not change with the route.
 *
 * Set as fine print on purpose. This world treats fine print as a designed
 * element rather than an afterthought — the same convention the recent-form and
 * bullpen panels use for their qualification footnotes — so it gets real
 * leading, a bounded measure, and the heavy rule that closes the page in the
 * same language the masthead opens it with.
 */
export default function Footer() {
  return (
    <footer className="border-t-2 border-rule-heavy">
      {/* The chat button is fixed at bottom-4 and the back-to-top control at
          bottom-20, both on the right. The extra bottom padding on phones keeps
          them from sitting on top of the last line of text once the reader has
          scrolled all the way down. */}
      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 sm:pb-8">
        <h2 className="card-label">Attribution</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
          Statistics and game data are owned by MLB and retrieved from the MLB Stats
          API. Team logos are the property of the Philadelphia Phillies. Betting odds
          are provided by DraftKings, via The Odds API.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-gray-500">
          An unofficial fan project — not affiliated with, endorsed by, or sponsored by
          MLB or the Philadelphia Phillies.
        </p>
      </div>
    </footer>
  )
}
