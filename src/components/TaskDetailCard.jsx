// Display card for a generated task — title, time limit + skill tags,
// problem statement, resource links, and expected outcomes. Mirrors the
// recruiter app's shared TaskDetailPanel (components/shared/task-library/
// task-detail-panel.tsx) so testmakers see the same card recruiters share
// with candidates.

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function DatasetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M1.5 6h13M6 6v7.5" />
    </svg>
  )
}

// Bullet lists split the statement on newlines, like the recruiter panel.
function toPoints(text) {
  return (text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** The link worth sharing: the task's own repository, falling back to the
 *  starter-code gist. Returns '' when neither exists, which is the signal not
 *  to render the Share control at all. */
export function shareableUrl(task) {
  const res = (task && task.resources) || {}
  return res.github_repo || res.github_gist || ''
}

export default function TaskDetailCard({ task, onShare, shareLabel }) {
  if (!task) return null
  const points = toPoints(task.problem_statement)
  const outcomes = task.outcomes || []
  const skills = task.skills || []
  const res = task.resources || {}
  const datasets = res.datasets || []
  // Share lives here rather than in the header: it only means anything once a
  // task exists, and this card IS the task. No link, no button — a Share
  // control that shares nothing is worse than no control.
  const canShare = !!onShare && !!shareableUrl(task)
  return (
    <div className="task-detail">
      <div className="task-detail-head">
        <div className="task-detail-titlerow">
          <h3 className="task-detail-title">{task.title}</h3>
          {canShare && (
            <button type="button" className="task-share" onClick={onShare}
                    title="Copy a link to this task">
              {shareLabel || 'Share'}
            </button>
          )}
        </div>
        <div className="task-detail-meta">
          {task.time_limit_mins ? (
            <span className="task-detail-time">
              <b>Time Limit:</b> {task.time_limit_mins} mins
            </span>
          ) : null}
          {skills.map((s, i) => (
            <span key={i} className={`skill-tag ${i === 0 ? 'basic' : 'info'}`}>
              {s.name}
              {s.proficiency ? <span className="skill-prof"> ({s.proficiency})</span> : null}
            </span>
          ))}
        </div>
      </div>

      {points.length > 0 && (
        <div className="task-detail-sec">
          <h4>Problem Statement</h4>
          <ul>
            {points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {(res.github_repo || res.github_gist || datasets.length > 0) && (
        <div className="task-detail-links">
          {/* The repository is the thing the recruiter actually hands to a
              candidate, and it was reachable only through the Share control —
              a task whose only resource is its repo (the common case) rendered
              no link at all, so the card looked like it had lost the repo. */}
          {res.github_repo && (
            <a href={res.github_repo} target="_blank" rel="noopener noreferrer" className="res-btn">
              <GithubIcon />
              <span>View repository</span>
            </a>
          )}
          {res.github_gist && (
            <a href={res.github_gist} target="_blank" rel="noopener noreferrer" className="res-btn">
              <GithubIcon />
              <span>View starter code</span>
            </a>
          )}
          {datasets.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="res-btn">
              <DatasetIcon />
              <span>{datasets.length > 1 ? `View dataset ${i + 1}` : 'View dataset'}</span>
            </a>
          ))}
        </div>
      )}

      {outcomes.length > 0 && (
        <div className="task-detail-sec">
          <h4>Expected Outcomes</h4>
          <ul>
            {outcomes.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
