// First-run product tour.
//
// driver.js was chosen over the usual suspects for two reasons that are easy to
// miss: shepherd.js and intro.js are both AGPL-3.0 (a real exposure for a
// commercial product served over a network), and onborda / nextstepjs peer-
// depend on `next`, which this Vite SPA does not have. driver.js is MIT, has
// ZERO dependencies, ~5KB gzipped, and is framework-agnostic — no React wrapper
// to fall out of maintenance.
//
// The tour runs in TWO phases, because the app's key surfaces do not all exist
// at once. On first load there is no brief and no build button — they appear
// only after the conversation has produced something. A single tour would
// either highlight nothing or stop at "1 of 2".
//
//   phase 1 (on load)        what this is -> examples -> chat box -> skills
//   phase 2 (brief appears)  the brief -> the build button
//
// Phase 1 opens with a centred "what is this" step. A first-time visitor does
// not need a feature pointed at before they know what the product does.
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

// Versioned: bump the suffix after a redesign and everyone sees the tour once
// more, without us having to hunt down stale keys.
const KEYS = {
  intro: 'taskbuilder.tour.intro.v1',
  build: 'taskbuilder.tour.build.v1',
}

const INTRO_STEPS = [
  {
    // No `element` — driver renders this centred, like a welcome modal. A tour
    // that opens by pointing at a sidebar assumes the visitor already knows what
    // the product is. They don't; that is the first thing to answer.
    popover: {
      // Centred by CSS, not by driver: driver computes left from
      // `innerWidth/2 - measuredWidth/2`, and the measurement is taken against
      // its own default max-width before our wider one is in play, so the
      // modal lands off-centre. A transform-based centre cannot drift.
      popoverClass: 'uk-tour uk-tour-center',
      title: 'Welcome to Task Builder',
      description:
        '<p>Task Builder allows you to build production environments for your '
        + 'candidates to solve real problems in.</p>'
        + '<p>A problem consists of a github repo, sometimes infrastructure '
        + 'e.g. databases, APIs etc.</p>'
        + '<p>Just chat your way through it.</p>',
    },
  },
  {
    element: '.starters',
    popover: {
      title: 'The quickest way to see it',
      description:
        'Click any example to run the whole flow end to end. They are only pre-written opening messages — nothing is locked in, and you can change any of it afterwards.',
      side: 'bottom',
    },
  },
  {
    element: '.dock',
    popover: {
      title: 'Or just say what you need',
      description:
        'Plain sentences work best: <em>“I want an intermediate React task for a frontend engineer.”</em> We will ask follow-up questions until we have enough to build.',
      side: 'top',
    },
  },
  {
    // Last on purpose: this is a reference for when someone is unsure what we
    // support, not the way in. Leading with it buries the actual entry points.
    element: '.side-right',
    popover: {
      title: 'Not sure what we cover?',
      description:
        'Search the stacks we can build for here. Click any skill and it drops straight into the chat.',
      side: 'left',
    },
  },
]

const BUILD_STEPS = [
  {
    element: '.brief-card',
    popover: {
      title: 'Your brief fills itself in',
      description:
        'Five fields — stack, level, role, focus areas and industry. You never fill a form; answering in the chat fills it for you.',
      side: 'top',
    },
  },
  {
    element: '.brief-card .cta',
    popover: {
      title: 'Then build the task',
      description:
        'Once all five are set this runs the generator. It usually takes 5–10 minutes, so feel free to leave the tab open and come back.',
      side: 'top',
    },
  },
]

/**
 * Steps we can actually show: an element-less step is a centred popover and is
 * always valid; an element step is dropped when its target is absent, because
 * driver would otherwise cut an empty spotlight in the corner.
 */
const present = (steps) =>
  steps.filter((s) => !s.element || document.querySelector(s.element))

/**
 * Wait until every selector is in the DOM *and* the layout has settled.
 *
 * The greeting arrives from an async API call, so anything on a fixed timer
 * measures the page mid-flight: driver caches the element box, the greeting then
 * renders and pushes everything down, and the spotlight is left cutting a hole
 * over the wrong element. Two rAFs after the node appears means we measure after
 * the browser has laid it out.
 */
function whenReady(selector, cb, { timeout = 8000 } = {}) {
  const start = Date.now()
  const tick = () => {
    if (document.querySelector(selector)) {
      requestAnimationFrame(() => requestAnimationFrame(cb))
      return
    }
    if (Date.now() - start > timeout) return
    setTimeout(tick, 100)
  }
  tick()
}

function run(steps, key, { force }) {
  if (!force && localStorage.getItem(key)) return
  const visible = present(steps)
  if (!visible.length) return

  driver({
    showProgress: visible.length > 1,
    animate: true,
    overlayOpacity: 0.7,
    stagePadding: 6,
    stageRadius: 10,
    popoverClass: 'uk-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    steps: visible,
    // Mark seen on ANY exit — finished, skipped, or clicked away. A tour that
    // reappears because you dismissed it "the wrong way" is worse than no tour.
    onDestroyed: () => {
      try {
        localStorage.setItem(key, new Date().toISOString())
      } catch {
        // Private mode / storage disabled: showing the tour again is a much
        // smaller problem than breaking the app on a write we do not need.
      }
    },
  }).drive()
}

/** Phase 1 — run once the greeting bubble is actually on screen. */
export function startIntroTour({ force = false } = {}) {
  if (!force && localStorage.getItem(KEYS.intro)) return
  // Gate on the greeting, not on .starters: the starters render immediately,
  // the greeting does not, and it is the greeting arriving that shifts the page.
  whenReady('.chat .row', () => run(INTRO_STEPS, KEYS.intro, { force }))
}

/**
 * Phase 2 — the brief and build button, once they first appear.
 * Skipped entirely if the intro was never seen (someone deep-linking mid-flow
 * should not get half a tour out of order).
 */
export function startBuildTour({ force = false } = {}) {
  if (!force && localStorage.getItem(KEYS.build)) return
  // The intro must be finished first. Phase 2 triggers when a brief appears,
  // which on a first visit happens WHILE the intro is still on screen — that
  // rendered two driver instances at once, stacked popovers and duplicate
  // overlays. Two guards, because either alone is insufficient:
  //   * the intro key proves phase 1 was seen at all
  //   * a live .driver-popover proves it is still open right now (which the key
  //     cannot tell us, and which is exactly the case with ?tour=1 replays)
  const introDone = !!localStorage.getItem(KEYS.intro)
  if (!introDone) return
  whenReady('.brief-card .cta', () => {
    if (document.querySelector('.driver-popover')) return
    run(BUILD_STEPS, KEYS.build, { force })
  })
}

/** True when the URL asks for a replay (`?tour=1`). */
export function tourRequested() {
  try {
    return new URLSearchParams(window.location.search).get('tour') === '1'
  } catch {
    return false
  }
}
