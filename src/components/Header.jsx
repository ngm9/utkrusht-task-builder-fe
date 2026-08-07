// Header carries the skills toggle and nothing else.
//
// New task / Share / Download PDF used to live here. They were always-visible
// controls for things that mostly do not exist yet: on a fresh visit there is
// no task to share and nothing worth printing, so two of the three were dead
// weight or disabled most of the time. Share now appears on the generated task
// card, where it has something to act on. "New task" is still one click away in
// the history panel.

/** Right-panel toggle: a window with its right side split off, shaded when the
 *  panel is open. Replaces ✦, which said only "something sparkly" — this says
 *  what the button does. */
function SkillsPanelIcon({ on }) {
  return (
    <svg viewBox="0 0 16 16" width="21" height="21" aria-hidden="true"
         fill="none" stroke="currentColor" strokeWidth="1.15"
         strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M10.5 2.5v11" />
      {/* Filled only when open, so state does not rest on colour alone. */}
      {on && (
        <path d="M10.5 2.5H13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-2.5z"
              fill="currentColor" opacity="0.28" stroke="none" />
      )}
    </svg>
  )
}

// The history panel has no toggle: it is always open. A control whose only job
// is to hide the thing you came to use earns its place only if hiding is
// something people actually want, and here it was not.
export default function Header({ showSkills, onToggleSkills }) {
  return (
    <header>
      <h1>
        Task <span className="shimmer">Builder</span>
      </h1>
      <div className="header-actions">
        <button
          className={showSkills ? 'panel-toggle on' : 'panel-toggle'}
          type="button"
          onClick={onToggleSkills}
          title={showSkills ? 'Hide skills' : 'Show skills'}
          aria-pressed={showSkills}
        >
          <SkillsPanelIcon on={showSkills} />
        </button>
      </div>
    </header>
  )
}
