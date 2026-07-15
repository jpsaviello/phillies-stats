export default function Header() {
  return (
    <header className="bg-phillies-navy bg-pinstripe text-white border-b-4 border-phillies-red">
      <div className="max-w-7xl mx-auto px-4 py-5 flex items-center gap-4">
        <div className="bg-white rounded-full p-1.5 shadow">
          <img
            src="https://www.mlbstatic.com/team-logos/143.svg"
            alt="Phillies"
            className="w-11 h-11"
          />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide leading-none">
            Philadelphia Phillies
          </h1>
          <p className="font-display text-blue-200 text-sm uppercase tracking-widest mt-1">
            2026 Season Statistics
          </p>
        </div>
      </div>
    </header>
  )
}
