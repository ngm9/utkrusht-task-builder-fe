export default function Header({
  onNewTask,
  onDownloadPdf,
  showHistory,
  onToggleHistory,
  showSkills,
  onToggleSkills,
  onShare,
  canShare,
  shareLabel,
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
        <button className="hbtn" type="button" onClick={onNewTask}>
          New task
        </button>
        {/* Disabled until a task exists — a Share button that shares nothing is
            worse than no button. Copies the task's repo link for now; the
            product decision on a recruiter-style invite link is still open. */}
        <button className="hbtn" type="button" onClick={onShare} disabled={!canShare}
                title={canShare ? 'Copy a link to this task' : 'Build a task first'}>
          {shareLabel || 'Share'}
        </button>
        <button className="hbtn" type="button" onClick={onDownloadPdf}>
          Download PDF
        </button>
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
