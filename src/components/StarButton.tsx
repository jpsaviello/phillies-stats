interface Props {
  starred: boolean
  playerName: string
  onToggle: () => void
}

export default function StarButton({ starred, playerName, onToggle }: Props) {
  const label = starred ? `Unstar ${playerName}` : `Star ${playerName}`
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={label}
      title={label}
      className={`shrink-0 leading-none transition-colors ${
        starred ? 'text-phillies-red' : 'text-gray-300 hover:text-gray-400'
      }`}
      onClick={e => {
        // The whole <tr> opens GameLogModal — without this, every star click
        // would also pop the modal.
        e.stopPropagation()
        onToggle()
      }}
    >
      <svg
        viewBox="0 0 20 20"
        className="w-4 h-4"
        fill={starred ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinejoin="round"
          d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.48l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.5z"
        />
      </svg>
    </button>
  )
}
