export default function Header() {
  return (
    <header className="bg-[#E81828] text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
        <img
          src="https://www.mlbstatic.com/team-logos/143.svg"
          alt="Phillies"
          className="w-12 h-12"
        />
        <div>
          <h1 className="text-2xl font-bold leading-tight">Philadelphia Phillies</h1>
          <p className="text-red-200 text-sm">2026 Season Statistics</p>
        </div>
      </div>
    </header>
  )
}
