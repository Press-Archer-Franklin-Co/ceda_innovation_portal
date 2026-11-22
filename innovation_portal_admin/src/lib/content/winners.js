// 3.37 Winners: which challenge the screen opens on. The one whose results went out most recently; if none has
// results yet, a closed challenge, then the first in the list (the screen then shows its honest empty state).

export function defaultWinnersChallenge(list = [], now = Date.now()) {
  const announced = list
    .filter((p) => p.results_announced_at && new Date(p.results_announced_at).getTime() <= now)
    .sort((a, b) => new Date(b.results_announced_at) - new Date(a.results_announced_at))
  return announced[0] ?? list.find((p) => p.status === 'closed') ?? list[0] ?? null
}
