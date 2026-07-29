import { useEffect, useMemo, useState } from 'react'
import { ROLE_SUGGESTIONS, POPULAR_STACKS, FAMOUS_SKILLS } from '../constants.js'
import { env } from '../runtime-env.js'

// Skills come straight from the dev Supabase `competencies` table via its REST
// endpoint — the table has a public SELECT policy, so the anon key is enough
// and no backend endpoint is needed. Set these two envs (Vercel / local .env):
//   VITE_SUPABASE_URL       = https://<ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY  = <anon key>
const SB_URL = env('VITE_SUPABASE_URL').replace(/\/+$/, '')
const SB_KEY = env('VITE_SUPABASE_ANON_KEY').trim()

const PROF_ORDER = { BEGINNER: 0, BASIC: 1, INTERMEDIATE: 2, ADVANCED: 3 }
const PROF_SHORT = { BEGINNER: 'Be', BASIC: 'Ba', INTERMEDIATE: 'In', ADVANCED: 'Ad' }
const SEARCH_ROWS = 12 // cap rows while searching, so roles/stacks stay reachable

async function fetchSkills() {
  const url =
    `${SB_URL}/rest/v1/competencies` +
    `?select=name,proficiency,competency_type,language_agnostic` +
    `&is_enabled=eq.true&order=name.asc`
  const res = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  if (!res.ok) throw new Error(`skills fetch failed: ${res.status}`)
  const rows = await res.json()
  // Collapse the per-proficiency rows into one entry per skill name.
  const byName = new Map()
  for (const r of rows) {
    if (!r.name) continue
    const e = byName.get(r.name) || {
      name: r.name,
      profs: new Set(),
      type: r.competency_type || null,
      agnostic: !!r.language_agnostic,
    }
    if (r.proficiency) e.profs.add(r.proficiency)
    byName.set(r.name, e)
  }
  return [...byName.values()].map((e) => ({
    ...e,
    profs: [...e.profs].sort((a, b) => (PROF_ORDER[a] ?? 9) - (PROF_ORDER[b] ?? 9)),
  }))
}

export default function SkillsPanel({ onPickSkill, onPickRole, onPickStack }) {
  const [skills, setSkills] = useState([])
  const [state, setState] = useState(SB_URL && SB_KEY ? 'loading' : 'unconfigured')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (state !== 'loading') return
    let live = true
    fetchSkills()
      .then((s) => live && (setSkills(s), setState('ready')))
      .catch(() => live && setState('error'))
    return () => {
      live = false
    }
  }, [state])

  const term = q.trim().toLowerCase()
  const searching = term.length > 0

  // Default view: the 10 famous skills (looked up in the fetched set so their
  // proficiency tags render). While searching: match across all skills.
  const shown = useMemo(() => {
    if (searching) return skills.filter((s) => s.name.toLowerCase().includes(term))
    const byName = new Map(skills.map((s) => [s.name, s]))
    return FAMOUS_SKILLS.map((n) => byName.get(n)).filter(Boolean)
  }, [skills, term, searching])

  return (
    <aside className="side side-right" aria-label="Skills and suggestions">
      <div className="side-head">
        <h2 className="side-title">Skills</h2>
        {state === 'ready' && (
          <span className="side-count">{skills.length}</span>
        )}
      </div>

      <div className="skills-search">
        <input
          type="search"
          value={q}
          placeholder={state === 'ready' ? `Search all ${skills.length} skills…` : 'Search skills…'}
          onChange={(e) => setQ(e.target.value)}
          disabled={state !== 'ready'}
        />
      </div>

      <div className="side-scroll">
        {state === 'unconfigured' && (
          <p className="side-empty">
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to load
            skills from the dev database.
          </p>
        )}
        {state === 'loading' && <p className="side-empty">Loading skills…</p>}
        {state === 'error' && (
          <p className="side-empty">Couldn’t load skills. Check the Supabase envs.</p>
        )}

        {state === 'ready' && (
          <>
            <ul className="skill-list">
              {shown.slice(0, SEARCH_ROWS).map((s) => (
                <li key={s.name} className="skill-item">
                  <button
                    type="button"
                    className="skill-name-btn"
                    title={`Use ${s.name} (intermediate)`}
                    onClick={() => onPickSkill(s.name)}
                  >
                    <span className="skill-name">{s.name}</span>
                  </button>
                  <span className="skill-profs">
                    {s.profs.map((p) => (
                      <button
                        type="button"
                        key={p}
                        className="prof-tag"
                        title={`Use ${s.name} at ${p.toLowerCase()} level`}
                        data-short={PROF_SHORT[p] || p.slice(0, 2)}
                        data-full={p.charAt(0) + p.slice(1).toLowerCase()}
                        onClick={() => onPickSkill(s.name, p)}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {!searching && (
              <p className="side-more">Popular picks — search above for all {skills.length} skills.</p>
            )}
            {searching && shown.length > SEARCH_ROWS && (
              <p className="side-more">Showing {SEARCH_ROWS} of {shown.length} — refine your search.</p>
            )}
            {searching && shown.length === 0 && (
              <p className="side-empty">No skills match “{q}”.</p>
            )}
          </>
        )}

        <div className="side-section">
          <h3 className="side-subtitle">Suggested roles</h3>
          <div className="side-chips">
            {ROLE_SUGGESTIONS.map((r) => (
              <button key={r} type="button" className="side-chip" onClick={() => onPickRole(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="side-section">
          <h3 className="side-subtitle">Popular stacks</h3>
          <div className="side-chips">
            {POPULAR_STACKS.map((s) => (
              <button key={s} type="button" className="side-chip" onClick={() => onPickStack(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
