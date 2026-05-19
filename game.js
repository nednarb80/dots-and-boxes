// Every move in this codebase is: { type: "h" | "v", row: Number, col: Number }

// ─── Supabase ────────────────────────────────────────────────────────────────
// The key below is a *publishable* (anon) key — safe to ship in client code.
// It only has the permissions your Supabase row-level security policies allow.
// Never put your service_role key here.

const SUPABASE_URL = "https://xipsmlowphrcyvarhezw.supabase.co"
const SUPABASE_KEY = "sb_publishable_WlkVwXJWN9hhcdyYzd8CTw_Eag0ZYo5"

let sb = null
try {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
} catch(e) {
  console.warn("Supabase failed to load — stats will not be saved.", e)
}

async function lookupOrCreatePlayer(name) {
  if (!name || !sb) return null
  try {
    const { data } = await sb.from("players").select("*").eq("name", name).maybeSingle()
    if (data) return data
    const { data: created } = await sb.from("players")
      .insert({ name, games_played: 0, games_won: 0, games_by_grid: {} })
      .select().single()
    return created
  } catch(e) {
    console.warn("Stats lookup failed:", e)
    return null
  }
}

async function recordGameResult(name, won, gridBoxes) {
  if (!name || !sb) return
  try {
    const player = await lookupOrCreatePlayer(name)
    if (!player) return
    const byGrid = player.games_by_grid || {}
    const key = String(gridBoxes)
    if (!byGrid[key]) byGrid[key] = { played: 0, won: 0 }
    byGrid[key].played++
    if (won) byGrid[key].won++
    await sb.from("players").update({
      games_played:  (player.games_played || 0) + 1,
      games_won:     (player.games_won    || 0) + (won ? 1 : 0),
      games_by_grid: byGrid
    }).eq("id", player.id)
  } catch(e) {
    console.warn("Could not save stats:", e)
  }
}

async function showStats() {
  document.getElementById("stats-overlay").classList.add("visible")
  const content = document.getElementById("stats-content")
  if (!sb) {
    content.innerHTML = "<p class='stats-empty'>Stats unavailable — database not connected.</p>"
    return
  }
  content.innerHTML = "<p class='stats-empty'>Loading…</p>"
  try {
    const { data } = await sb.from("players")
      .select("*").order("games_won", { ascending: false })
    if (!data || data.length === 0) {
      content.innerHTML = "<p class='stats-empty'>No stats yet — play some games first!</p>"
      return
    }
    content.innerHTML = data.map(p => {
      const played = p.games_played || 0
      const won    = p.games_won    || 0
      const rate   = played > 0 ? Math.round(100 * won / played) : 0
      const byGrid = p.games_by_grid || {}
      const gridLines = Object.entries(byGrid)
        .filter(([, v]) => v.played > 0)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([k, v]) => `${k}×${k}: ${v.won}W / ${v.played - v.won}L`)
        .join("  ·  ")
      return `
        <div class="stats-player-row">
          <div class="stats-name">${p.name}</div>
          <div class="stats-record">${won}W / ${played - won}L &nbsp;·&nbsp; ${rate}% win rate</div>
          ${gridLines ? `<div class="stats-grid">${gridLines}</div>` : ""}
        </div>`
    }).join("")
  } catch(e) {
    content.innerHTML = "<p class='stats-empty'>Could not load stats.</p>"
    console.warn(e)
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

let GRID_SIZE = 6
let BOXES     = GRID_SIZE - 1

const CELL_SIZE = 80
const MARGIN    = 40
const HIT       = 32   // SVG units — wide for touch

const dotX = col => MARGIN + col * CELL_SIZE
const dotY = row => MARGIN + row * CELL_SIZE

// ─── Dynamic player colors ────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function getPlayerColor(p) {
  const el = document.getElementById(`color-${p}`)
  return el ? el.value : (p === 1 ? "#3b82f6" : "#ef4444")
}

function getPlayerFill(p) {
  return hexToRgba(getPlayerColor(p), 0.2)
}

function applyColorsToCss() {
  document.documentElement.style.setProperty("--p1-color", getPlayerColor(1))
  document.documentElement.style.setProperty("--p2-color", getPlayerColor(2))
}

// ─── Sound ───────────────────────────────────────────────────────────────────
// iOS Safari requires AudioContext to be created inside a user gesture.
// warmUpAudio fires on first touch to unlock it before any game logic runs.

let audioCtx = null

function warmUpAudio() {
  if (audioCtx) return
  try {
    audioCtx = new (window.AudioContext || window["webkitAudioContext"])()
    const buf = audioCtx.createBuffer(1, 1, 22050)
    const src = audioCtx.createBufferSource()
    src.buffer = buf
    src.connect(audioCtx.destination)
    src.start()
  } catch(e) {}
}

function playPloink() {
  try {
    if (!audioCtx) return
    if (audioCtx.state === "suspended") audioCtx.resume()
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = "triangle"
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.setValueAtTime(540, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(130, audioCtx.currentTime + 0.14)
    gain.gain.setValueAtTime(0.28, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.18)
  } catch(e) {}
}

document.addEventListener("touchstart", warmUpAudio, { once: true, passive: true })
document.addEventListener("mousedown",  warmUpAudio, { once: true })

// ─── Board helpers ────────────────────────────────────────────────────────────

const make2D = (rows, cols) =>
  Array.from({ length: rows }, () => Array(cols).fill(null))

function createBoard() {
  return {
    hEdges: make2D(GRID_SIZE, BOXES),
    vEdges: make2D(BOXES, GRID_SIZE),
    boxes:  make2D(BOXES, BOXES)
  }
}

// ─── Game state ───────────────────────────────────────────────────────────────

function createGame() {
  return {
    board: createBoard(),
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    isOver: false,
    id: (createGame.nextId = (createGame.nextId || 0) + 1)
  }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

function claimEdge(game, move) {
  const { type, row, col } = move
  const edges = type === "h" ? game.board.hEdges : game.board.vEdges
  if (edges[row][col] !== null) return { success: false, boxesCompleted: 0 }
  edges[row][col] = game.currentPlayer
  const boxesCompleted = checkBoxes(game, move)
  game.currentPlayer = game.currentPlayer === 1 ? 2 : 1   // always alternate
  return { success: true, boxesCompleted }
}

function checkBoxes(game, move) {
  const { type, row, col } = move
  const { hEdges, vEdges, boxes } = game.board
  let count = 0
  const candidates = type === "h"
    ? [[row - 1, col], [row, col]]
    : [[row, col - 1], [row, col]]
  for (const [boxRow, boxCol] of candidates) {
    if (boxRow < 0 || boxRow >= BOXES || boxCol < 0 || boxCol >= BOXES) continue
    if (boxes[boxRow][boxCol] !== null) continue
    const top    = hEdges[boxRow][boxCol]
    const bottom = hEdges[boxRow + 1][boxCol]
    const left   = vEdges[boxRow][boxCol]
    const right  = vEdges[boxRow][boxCol + 1]
    if (top !== null && bottom !== null && left !== null && right !== null) {
      boxes[boxRow][boxCol] = game.currentPlayer
      game.scores[game.currentPlayer]++
      count++
    }
  }
  return count
}

function checkGameOver(game) {
  if (game.scores[1] + game.scores[2] === BOXES * BOXES) game.isOver = true
  return game.isOver
}

function applyMove(game, move) {
  const result = claimEdge(game, move)
  if (result.success) checkGameOver(game)
  return result
}

function getAvailableMoves(game) {
  const moves = []
  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < BOXES; col++)
      if (game.board.hEdges[row][col] === null)
        moves.push({ type: "h", row, col })
  for (let row = 0; row < BOXES; row++)
    for (let col = 0; col < GRID_SIZE; col++)
      if (game.board.vEdges[row][col] === null)
        moves.push({ type: "v", row, col })
  return moves
}

// ─── Clone ────────────────────────────────────────────────────────────────────

function cloneGame(g) {
  const b = g.board
  return {
    board: {
      hEdges: b.hEdges.map(r => r.slice()),
      vEdges: b.vEdges.map(r => r.slice()),
      boxes:  b.boxes.map(r => r.slice())
    },
    currentPlayer: g.currentPlayer,
    scores: { 1: g.scores[1], 2: g.scores[2] },
    isOver: g.isOver,
    id: g.id
  }
}

// ─── AI ───────────────────────────────────────────────────────────────────────

function countThreeSided(g) {
  let count = 0
  const { hEdges, vEdges, boxes } = g.board
  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < BOXES; c++) {
      if (boxes[r][c] !== null) continue
      const sides = [hEdges[r][c], hEdges[r+1][c], vEdges[r][c], vEdges[r][c+1]]
      if (sides.filter(e => e !== null).length === 3) count++
    }
  return count
}

function randomAI(g) {
  const moves = getAvailableMoves(g)
  return moves[Math.floor(Math.random() * moves.length)]
}

// Easy: takes free boxes when available, otherwise ~40% greedy / 60% random
function easyAI(g) {
  const moves = getAvailableMoves(g)
  for (const move of moves) {
    const clone = cloneGame(g)
    if (applyMove(clone, move).boxesCompleted > 0) return move
  }
  if (Math.random() < 0.4) return greedyAI(g)
  return moves[Math.floor(Math.random() * moves.length)]
}

function greedyAI(g) {
  const moves = getAvailableMoves(g)
  for (const move of moves) {
    const clone = cloneGame(g)
    if (applyMove(clone, move).boxesCompleted > 0) return move
  }
  let bestMove = moves[Math.floor(Math.random() * moves.length)]
  let bestGifts = Infinity
  for (const move of moves) {
    const clone = cloneGame(g)
    applyMove(clone, move)
    const gifts = countThreeSided(clone)
    if (gifts < bestGifts) { bestGifts = gifts; bestMove = move }
  }
  return bestMove
}

function evaluate(g) {
  return (g.scores[2] - g.scores[1]) - 0.5 * countThreeSided(g)
}

function quickMoveScore(g, move) {
  const clone = cloneGame(g)
  const result = applyMove(clone, move)
  if (result.boxesCompleted > 0) return 2
  return countThreeSided(clone) <= countThreeSided(g) ? 1 : 0
}

function minimax(g, depth, isMaximizing, alpha, beta) {
  if (g.isOver || depth === 0) return evaluate(g)
  const moves = getAvailableMoves(g)
  let best = isMaximizing ? -Infinity : Infinity
  for (const move of moves) {
    const clone = cloneGame(g)
    applyMove(clone, move)
    const score = minimax(clone, depth - 1, !isMaximizing, alpha, beta)
    if (isMaximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best) }
    else              { best = Math.min(best, score); beta  = Math.min(beta,  best) }
    if (beta <= alpha) break
  }
  return best
}

function minimaxAI(depth) {
  return function(g) {
    const moves = getAvailableMoves(g)
    moves.sort((a, b) => quickMoveScore(g, b) - quickMoveScore(g, a))
    let bestMove = moves[0], bestScore = -Infinity
    for (const move of moves) {
      const clone = cloneGame(g)
      applyMove(clone, move)
      const score = minimax(clone, depth - 1, false, -Infinity, Infinity)
      if (score > bestScore) { bestScore = score; bestMove = move }
    }
    return bestMove
  }
}

function aiLabel(diff) {
  if (diff === "easy")   return "Computer (Easy)"
  if (diff === "hard")   return "Computer (Hard)"
  if (diff === "expert") return "Computer (Expert)"
  return "Computer"
}

function getAI() {
  const d = document.getElementById("difficulty").value
  if (d === "easy") return easyAI
  if (d === "hard") {
    const depth = BOXES <= 3 ? 5 : BOXES <= 4 ? 4 : 3
    return minimaxAI(depth)
  }
  if (d === "expert") {
    const depth = BOXES <= 3 ? 7 : BOXES <= 4 ? 6 : BOXES <= 5 ? 5 : 4
    return minimaxAI(depth)
  }
  return greedyAI
}

// ─── Mode state ───────────────────────────────────────────────────────────────

let aiMode     = false
let aiThinking = false

function isAITurn() {
  return aiMode && game.currentPlayer === 2
}

function scheduleAI() {
  if (!isAITurn() || game.isOver) return
  aiThinking = true
  document.getElementById("ai-thinking").classList.add("visible")
  const expectedId = game.id
  setTimeout(() => {
    if (game.id !== expectedId) return
    const before = getClaimedBoxSet(game)
    const move   = getAI()(game)
    applyMove(game, move)
    playPloink()
    const after    = getClaimedBoxSet(game)
    const newBoxes = new Set([...after].filter(k => !before.has(k)))
    render(game, newBoxes)
    aiThinking = false
    document.getElementById("ai-thinking").classList.remove("visible")
    if (game.isOver) { clearUndoTimer(); showGameOver() }
  }, 420)
}

// ─── Player name helpers ──────────────────────────────────────────────────────

function playerName(p) {
  if (p === 2 && aiMode) return aiLabel(document.getElementById("difficulty").value)
  const val = document.getElementById(`name-${p}`).value.trim()
  return val || `Player ${p}`
}

function playerInitial(p) {
  if (p === 2 && aiMode) return "AI"
  const val = document.getElementById(`name-${p}`).value.trim()
  return val ? val[0].toUpperCase() : `P${p}`
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

const svg    = document.getElementById("board")
const layers = {
  boxes: document.getElementById("layer-boxes"),
  edges: document.getElementById("layer-edges"),
  dots:  document.getElementById("layer-dots"),
  hover: document.getElementById("layer-hover")
}

function makeSVG(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

function drawDots() {
  layers.dots.innerHTML = ""
  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < GRID_SIZE; col++)
      layers.dots.appendChild(makeSVG("circle", {
        cx: dotX(col), cy: dotY(row), r: 4, fill: "#55556e"
      }))
}

function drawEdges(game) {
  layers.edges.innerHTML = ""
  const { hEdges, vEdges } = game.board
  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < BOXES; col++) {
      const claimed = hEdges[row][col]
      layers.edges.appendChild(makeSVG("line", {
        x1: dotX(col), y1: dotY(row), x2: dotX(col+1), y2: dotY(row),
        stroke: claimed ? getPlayerColor(claimed) : "#2a2a3a",
        "stroke-width": claimed ? 4 : 1.5,
        "stroke-linecap": "round",
        opacity: claimed ? 1 : 0.9
      }))
    }
  for (let row = 0; row < BOXES; row++)
    for (let col = 0; col < GRID_SIZE; col++) {
      const claimed = vEdges[row][col]
      layers.edges.appendChild(makeSVG("line", {
        x1: dotX(col), y1: dotY(row), x2: dotX(col), y2: dotY(row+1),
        stroke: claimed ? getPlayerColor(claimed) : "#2a2a3a",
        "stroke-width": claimed ? 4 : 1.5,
        "stroke-linecap": "round",
        opacity: claimed ? 1 : 0.9
      }))
    }
}

function drawBoxes(game, newBoxes = new Set()) {
  layers.boxes.innerHTML = ""
  const { boxes } = game.board
  const fontSize = Math.max(10, Math.min(18, CELL_SIZE * 0.28))
  for (let row = 0; row < BOXES; row++)
    for (let col = 0; col < BOXES; col++) {
      const owner = boxes[row][col]
      if (owner === null) continue
      const isNew = newBoxes.has(`${row},${col}`)
      const rect = makeSVG("rect", {
        x: dotX(col) + 4, y: dotY(row) + 4,
        width: CELL_SIZE - 8, height: CELL_SIZE - 8,
        fill: getPlayerFill(owner), rx: 6
      })
      if (isNew) rect.classList.add("box-new")
      layers.boxes.appendChild(rect)
      const label = makeSVG("text", {
        x: dotX(col) + CELL_SIZE / 2, y: dotY(row) + CELL_SIZE / 2,
        "text-anchor": "middle", "dominant-baseline": "central",
        "font-size": fontSize, "font-weight": "bold",
        "font-family": "Outfit, sans-serif",
        fill: getPlayerColor(owner), "pointer-events": "none"
      })
      label.textContent = playerInitial(owner)
      if (isNew) label.classList.add("box-new")
      layers.boxes.appendChild(label)
    }
}

function render(game, newBoxes = new Set()) {
  drawBoxes(game, newBoxes)
  drawEdges(game)
  drawDots()
  document.getElementById("score-1").textContent = game.scores[1]
  document.getElementById("score-2").textContent = game.scores[2]
  document.getElementById("panel-1").className =
    "player-panel" + (!game.isOver && game.currentPlayer === 1 ? " active-1" : "")
  document.getElementById("panel-2").className =
    "player-panel" + (!game.isOver && game.currentPlayer === 2 ? " active-2" : "")
  document.getElementById("status").textContent =
    game.isOver ? "" : `${playerName(game.currentPlayer)}'s turn`
}

// ─── Hit detection (distance-based — no corner ambiguity) ────────────────────

function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.width &&
         py >= rect.y && py <= rect.y + rect.height
}

function findEdgeAt(x, y) {
  let best = null, bestDist = Infinity

  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < BOXES; col++) {
      const rect = { x: dotX(col), y: dotY(row) - HIT/2, width: CELL_SIZE, height: HIT }
      if (pointInRect(x, y, rect)) {
        const d = Math.hypot(x - (dotX(col) + CELL_SIZE/2), y - dotY(row))
        if (d < bestDist) { bestDist = d; best = { type: "h", row, col } }
      }
    }

  for (let row = 0; row < BOXES; row++)
    for (let col = 0; col < GRID_SIZE; col++) {
      const rect = { x: dotX(col) - HIT/2, y: dotY(row), width: HIT, height: CELL_SIZE }
      if (pointInRect(x, y, rect)) {
        const d = Math.hypot(x - dotX(col), y - (dotY(row) + CELL_SIZE/2))
        if (d < bestDist) { bestDist = d; best = { type: "v", row, col } }
      }
    }

  return best
}

function clientToSVG(svg, clientX, clientY) {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  return pt.matrixTransform(svg.getScreenCTM().inverse())
}

// ─── Hover ────────────────────────────────────────────────────────────────────

let hoveredMove = null

function drawHover(game) {
  layers.hover.innerHTML = ""
  if (!hoveredMove || game.isOver || isAITurn()) return
  const { type, row, col } = hoveredMove
  const edges = type === "h" ? game.board.hEdges : game.board.vEdges
  if (edges[row][col] !== null) return
  const attrs = type === "h"
    ? { x1: dotX(col), y1: dotY(row), x2: dotX(col+1), y2: dotY(row) }
    : { x1: dotX(col), y1: dotY(row), x2: dotX(col),   y2: dotY(row+1) }
  layers.hover.appendChild(makeSVG("line", {
    ...attrs, stroke: getPlayerColor(game.currentPlayer),
    "stroke-width": 4, "stroke-linecap": "round", opacity: 0.45
  }))
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

let undoSnapshot = null
let undoTimer    = null
const UNDO_SECONDS = 5

function saveUndo() {
  startUndoTimer()
  undoSnapshot = cloneGame(game)   // must be AFTER startUndoTimer (it clears previous snapshot)
}

function startUndoTimer() {
  clearUndoTimer()
  let remaining = UNDO_SECONDS
  const btn = document.getElementById("undo")
  btn.textContent = `Undo (${remaining}s)`
  btn.style.display = "inline-block"
  undoTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) clearUndoTimer()
    else btn.textContent = `Undo (${remaining}s)`
  }, 1000)
}

function clearUndoTimer() {
  clearInterval(undoTimer)
  undoTimer = null
  undoSnapshot = null
  const btn = document.getElementById("undo")
  btn.style.display = "none"
  btn.textContent = "Undo"
}

// ─── Handoff overlay ──────────────────────────────────────────────────────────

function showHandoff(player, callback) {
  const overlay = document.getElementById("handoff-overlay")
  document.getElementById("handoff-name").textContent = `${playerName(player)}'s turn`
  overlay.className = `overlay visible p${player}`
  document.getElementById("handoff-ok").onclick = () => {
    overlay.classList.remove("visible")
    callback()
  }
}

// ─── Move handling ────────────────────────────────────────────────────────────

function getClaimedBoxSet(g) {
  const claimed = new Set()
  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < BOXES; c++)
      if (g.board.boxes[r][c] !== null) claimed.add(`${r},${c}`)
  return claimed
}

function commitMove(move) {
  const before = getClaimedBoxSet(game)
  saveUndo()
  applyMove(game, move)
  playPloink()
  const after    = getClaimedBoxSet(game)
  const newBoxes = new Set([...after].filter(k => !before.has(k)))
  render(game, newBoxes)
  drawHover(game)
  if (game.isOver) { clearUndoTimer(); showGameOver(); return }
  if (aiMode) {
    scheduleAI()
  } else {
    showHandoff(game.currentPlayer, () => {})
  }
}

function handleMove(move) {
  if (!move || game.isOver || aiThinking) return
  if (isAITurn()) return
  commitMove(move)
}

svg.addEventListener("mousemove", e => {
  const { x, y } = clientToSVG(svg, e.clientX, e.clientY)
  hoveredMove = findEdgeAt(x, y)
  drawHover(game)
})
svg.addEventListener("mouseleave", () => {
  hoveredMove = null
  layers.hover.innerHTML = ""
})
svg.addEventListener("click", e => {
  const { x, y } = clientToSVG(svg, e.clientX, e.clientY)
  handleMove(findEdgeAt(x, y))
})
svg.addEventListener("touchstart", e => {
  e.preventDefault()
  const touch = e.touches[0]
  const { x, y } = clientToSVG(svg, touch.clientX, touch.clientY)
  handleMove(findEdgeAt(x, y))
}, { passive: false })

document.getElementById("undo").addEventListener("click", () => {
  if (!undoSnapshot) return
  game = undoSnapshot
  clearUndoTimer()
  aiThinking = false
  document.getElementById("ai-thinking").classList.remove("visible")
  document.getElementById("handoff-overlay").classList.remove("visible")
  render(game)
})

// ─── Stats ────────────────────────────────────────────────────────────────────

document.getElementById("stats-btn").addEventListener("click", showStats)
document.getElementById("stats-close").addEventListener("click", () => {
  document.getElementById("stats-overlay").classList.remove("visible")
})

// ─── Splash screen ────────────────────────────────────────────────────────────

// ─── Avatar picker ────────────────────────────────────────────────────────────

const AVATARS = [
  "alien.png","astronaut.png","aviator.png","cactus.png","cat.png",
  "flame.png","fox.png","ghost.png","lighting.png","ninja",
  "obot.png","owl.png","pirate.png","princess.png","samurai.png",
  "scuba.png","trash panda.png","wave.png"
]

const playerAvatar = { 1: "avatars/alien.png", 2: "avatars/astronaut.png" }
let avatarPickingFor = 1

function openAvatarModal(player) {
  avatarPickingFor = player
  const color = document.getElementById(`splash-color-${player}`).value
  document.getElementById("avatar-modal-title").textContent =
    `Player ${player} — Choose Avatar`
  document.getElementById("avatar-modal-title").style.color = color

  const grid = document.getElementById("avatar-grid")
  grid.innerHTML = ""
  AVATARS.forEach(name => {
    const img = document.createElement("img")
    img.src = `avatars/${name}`
    img.alt = name.replace(/\.\w+$/, "")
    img.className = "avatar-option"
    if (playerAvatar[player] === `avatars/${name}`) img.classList.add("chosen")
    img.addEventListener("click", () => {
      playerAvatar[player] = `avatars/${name}`
      document.getElementById(`avatar-preview-${player}`).src = `avatars/${name}`
      document.getElementById("avatar-modal").classList.remove("open")
    })
    grid.appendChild(img)
  })
  document.getElementById("avatar-modal").classList.add("open")
}

document.getElementById("avatar-preview-1").addEventListener("click", () => openAvatarModal(1))
document.getElementById("avatar-preview-2").addEventListener("click", () => openAvatarModal(2))
document.getElementById("avatar-modal-close").addEventListener("click", () => {
  document.getElementById("avatar-modal").classList.remove("open")
})
document.getElementById("avatar-modal").addEventListener("click", e => {
  if (e.target === document.getElementById("avatar-modal"))
    document.getElementById("avatar-modal").classList.remove("open")
})

function showSplash() {
  document.getElementById("splash").classList.remove("hidden")
}
function hideSplash() {
  document.getElementById("splash").classList.add("hidden")
}

document.getElementById("splash-color-1").addEventListener("input", e => {
  document.documentElement.style.setProperty("--p1-color", e.target.value)
  document.getElementById("splash-panel-1").style.borderColor = e.target.value
  document.getElementById("avatar-preview-1").style.borderColor = e.target.value
})
document.getElementById("splash-color-2").addEventListener("input", e => {
  document.documentElement.style.setProperty("--p2-color", e.target.value)
  document.getElementById("splash-panel-2").style.borderColor = e.target.value
  document.getElementById("avatar-preview-2").style.borderColor = e.target.value
})

document.getElementById("splash-mode").addEventListener("change", e => {
  const isAI = e.target.value === "ai"
  const name2 = document.getElementById("splash-name-2")
  const diffRow = document.getElementById("splash-difficulty-row")
  name2.disabled = isAI
  if (isAI) name2.value = ""
  diffRow.style.display = isAI ? "flex" : "none"
})

document.getElementById("splash-stats-link").addEventListener("click", e => {
  e.preventDefault()
  showStats()
})

document.getElementById("splash-start").addEventListener("click", () => {
  const n1   = document.getElementById("splash-name-1").value.trim()
  const n2   = document.getElementById("splash-name-2").value.trim()
  const c1   = document.getElementById("splash-color-1").value
  const c2   = document.getElementById("splash-color-2").value
  const mode = document.getElementById("splash-mode").value
  const diff = document.getElementById("splash-difficulty").value
  const grid = parseInt(document.getElementById("splash-grid").value)

  // Copy into hidden game inputs
  document.getElementById("name-1").value     = n1
  document.getElementById("name-2").value     = n2
  document.getElementById("color-1").value    = c1
  document.getElementById("color-2").value    = c2
  document.getElementById("mode").value       = mode
  document.getElementById("difficulty").value = diff

  // Update displayed names
  document.getElementById("display-name-1").textContent = n1 || "Player 1"
  document.getElementById("display-name-2").textContent =
    mode === "ai" ? aiLabel(diff) : (n2 || "Player 2")

  // Apply colors
  applyColorsToCss()

  // Update game globals
  aiMode    = (mode === "ai")
  BOXES     = grid
  GRID_SIZE = grid + 1

  // Update SVG viewBox
  const svgSize = MARGIN * 2 + BOXES * CELL_SIZE
  svg.setAttribute("viewBox", `0 0 ${svgSize} ${svgSize}`)

  // Apply avatars to game panels
  document.getElementById("panel-avatar-1").src = playerAvatar[1]
  document.getElementById("panel-avatar-2").src = playerAvatar[2]

  hideSplash()
  startNewGame()
})

// ─── New game button → back to splash ────────────────────────────────────────

document.getElementById("new-game-btn").addEventListener("click", () => {
  document.getElementById("splash-name-1").value     = document.getElementById("name-1").value
  document.getElementById("splash-name-2").value     = document.getElementById("name-2").value
  document.getElementById("splash-color-1").value    = document.getElementById("color-1").value
  document.getElementById("splash-color-2").value    = document.getElementById("color-2").value
  document.getElementById("splash-mode").value       = document.getElementById("mode").value
  document.getElementById("splash-difficulty").value = document.getElementById("difficulty").value

  const isAI = document.getElementById("mode").value === "ai"
  document.getElementById("splash-name-2").disabled = isAI
  document.getElementById("splash-difficulty-row").style.display = isAI ? "flex" : "none"

  document.getElementById("overlay").classList.remove("visible")
  showSplash()
})

// ─── Game over ────────────────────────────────────────────────────────────────

document.getElementById("overlay-rematch").addEventListener("click", () => {
  document.getElementById("overlay").classList.remove("visible")
  startNewGame()
})
document.getElementById("overlay-newgame").addEventListener("click", () => {
  document.getElementById("overlay").classList.remove("visible")
  document.getElementById("new-game-btn").click()
})
document.getElementById("overlay-stats").addEventListener("click", () => {
  document.getElementById("overlay").classList.remove("visible")
  showStats()
})
document.getElementById("overlay-view").addEventListener("click", () => {
  document.getElementById("overlay").classList.remove("visible")
})

async function showGameOver() {
  const { 1: s1, 2: s2 } = game.scores
  const n1 = playerName(1), n2 = playerName(2)
  const winner = s1 === s2 ? 0 : (s1 > s2 ? 1 : 2)
  document.getElementById("overlay-title").textContent =
    winner === 0 ? "Tie Game!" : `${winner === 1 ? n1 : n2} Wins!`
  document.getElementById("overlay-scores").textContent =
    `${n1}: ${s1}   –   ${n2}: ${s2}`
  document.getElementById("overlay").classList.add("visible")

  // Save stats (only for named human players)
  const name1 = document.getElementById("name-1").value.trim()
  const name2 = !aiMode ? document.getElementById("name-2").value.trim() : null
  if (name1) recordGameResult(name1, winner === 1, BOXES)
  if (name2) recordGameResult(name2, winner === 2, BOXES)
}

// ─── Start / restart ──────────────────────────────────────────────────────────

function startNewGame() {
  game = createGame()
  hoveredMove = null
  aiThinking  = false
  document.getElementById("ai-thinking").classList.remove("visible")
  clearUndoTimer()
  document.getElementById("overlay").classList.remove("visible")
  document.getElementById("handoff-overlay").classList.remove("visible")
  render(game)
  if (isAITurn()) scheduleAI()
}

// ─── Init ─────────────────────────────────────────────────────────────────────

let game = createGame()
render(game)
showSplash()
