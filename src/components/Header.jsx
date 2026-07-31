// Header carries the two panel toggles and nothing else.
//
// New task / Share / Download PDF used to live here. They were always-visible
// controls for things that mostly do not exist yet: on a fresh visit there is
// no task to share and nothing worth printing, so two of the three were dead
// weight or disabled most of the time. Share now appears on the generated task
// card, where it has something to act on. "New task" is still one click away in
// the history panel.
export default function Header({
  showHistory,
  onToggleHistory,
  showSkills,
  onToggleSkills,
}) {
  return (
    <header>
      <button
        className={showHistory ? 'panel-toggle on' : 'panel-toggle'}
        type="button"
        onClick={onToggleHistory}
        title="Toggle task history"
        aria-pressed={showHistory}
      >
        ☰
      </button>
      <img className="logo" src="/utkrusht-logo.png" alt="Utkrusht" />
      <span className="header-sep" aria-hidden="true"></span>
      <h1>
        Task <span className="shimmer">Builder</span>
      </h1>
      <div className="header-actions">
        <button
          className={showSkills ? 'panel-toggle on' : 'panel-toggle'}
          type="button"
          onClick={onToggleSkills}
          title="Toggle skills panel"
          aria-pressed={showSkills}
        >
          ✦
        </button>
      </div>
    </header>
  )
}
