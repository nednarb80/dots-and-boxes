// Web worker — pure game logic + minimax AI
// Receives: { game, gridSize, boxes, timeLimit, gameId }
// Responds: { move, gameId }

let GRID_SIZE, BOXES

// --- Game logic (duplicated from game.js — must stay pure, no DOM) ---

const make2D = (rows, cols) =>
  Array.from({ length: rows }, () => Array(cols).fill(null))

function claimEdge(game, move) {
  const { type, row, col } = move
  const edges = type === "h" ? game.board.hEdges : game.board.vEdges
  if (edges[row][col] !== null) return { success: false, boxesCompleted: 0 }
  edges[row][col] = game.currentPlayer
  const boxesCompleted = checkBoxes(game, move)
  game.currentPlayer = game.currentPlayer === 1 ? 2 : 1
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

// --- Chain analysis ---

function freeCount(g, r, c) {
  const { hEdges, vEdges } = g.board
  return [hEdges[r][c], hEdges[r+1][c], vEdges[r][c], vEdges[r][c+1]]
    .filter(e => e === null).length
}

// Connected components of unclaimed boxes, joined by unclaimed shared edges.
// Each component is a "chain" — the player who opens it gifts all those boxes to the opponent.
function findComponents(g) {
  const { boxes, hEdges, vEdges } = g.board
  const visited = Array.from({ length: BOXES }, () => Array(BOXES).fill(false))
  const components = []

  for (let r = 0; r < BOXES; r++) {
    for (let c = 0; c < BOXES; c++) {
      if (boxes[r][c] !== null || visited[r][c]) continue
      const component = []
      const queue = [[r, c]]
      visited[r][c] = true
      while (queue.length) {
        const [br, bc] = queue.shift()
        component.push([br, bc])
        // Four neighbors — connected only if shared edge is unclaimed
        const nbrs = [
          [br-1, bc, hEdges[br][bc]],
          [br+1, bc, hEdges[br+1] && hEdges[br+1][bc]],
          [br, bc-1, vEdges[br][bc]],
          [br, bc+1, vEdges[br][bc+1]]
        ]
        for (const [nr, nc, sharedEdge] of nbrs) {
          if (nr < 0 || nr >= BOXES || nc < 0 || nc >= BOXES) continue
          if (visited[nr][nc] || boxes[nr][nc] !== null) continue
          if (sharedEdge === null) {
            visited[nr][nc] = true
            queue.push([nr, nc])
          }
        }
      }
      components.push(component)
    }
  }
  return components
}

// --- Evaluation ---
// Positive = good for player 2 (AI), negative = good for player 1 (human)

function evaluate(g) {
  let threeSided = 0
  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < BOXES; c++) {
      if (g.board.boxes[r][c] !== null) continue
      if (freeCount(g, r, c) === 3) threeSided++
    }

  // Chain parity: long chains (≥3) are the core of DoB strategy.
  // The player forced to open a long chain loses all its boxes.
  // Count long chains and apply a parity-based penalty.
  const components = findComponents(g)
  let longChains = 0
  for (const comp of components) {
    if (comp.length >= 3) longChains++
  }
  // Odd number of long chains slightly favors the player who moves second into them
  const chainPenalty = longChains * 0.4

  return (g.scores[2] - g.scores[1]) - 0.5 * threeSided - chainPenalty
}

// --- Move ordering (improves alpha-beta pruning significantly) ---

function moveScore(g, move) {
  const clone = cloneGame(g)
  const result = applyMove(clone, move)
  if (result.boxesCompleted > 0) return 2   // scoring move — try first
  // Count new 3-sided boxes created (gifts to opponent)
  let gifts = 0
  for (let r = 0; r < BOXES; r++)
    for (let c = 0; c < BOXES; c++)
      if (clone.board.boxes[r][c] === null && freeCount(clone, r, c) === 3) gifts++
  return gifts === 0 ? 1 : 0   // safe > risky
}

function orderedMoves(g) {
  const moves = getAvailableMoves(g)
  return moves.sort((a, b) => moveScore(g, b) - moveScore(g, a))
}

// --- Minimax with alpha-beta ---

function minimax(g, depth, isMaximizing, alpha, beta) {
  if (g.isOver || depth === 0) return evaluate(g)
  const moves = orderedMoves(g)
  let best = isMaximizing ? -Infinity : Infinity
  for (const move of moves) {
    const clone = cloneGame(g)
    applyMove(clone, move)
    const score = minimax(clone, depth - 1, !isMaximizing, alpha, beta)
    if (isMaximizing) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return best
}

function getBestMoveAtDepth(g, depth) {
  const moves = orderedMoves(g)
  let bestMove = moves[0]
  let bestScore = -Infinity
  for (const move of moves) {
    const clone = cloneGame(g)
    applyMove(clone, move)
    const score = minimax(clone, depth - 1, false, -Infinity, Infinity)
    if (score > bestScore) { bestScore = score; bestMove = move }
  }
  return bestMove
}

// --- Iterative deepening with time budget ---

self.onmessage = function(e) {
  const { game, gridSize, boxes, timeLimit, gameId } = e.data
  GRID_SIZE = gridSize
  BOXES = boxes

  const start = Date.now()
  const moves = getAvailableMoves(game)
  let bestMove = moves[0]

  for (let depth = 1; depth <= 12; depth++) {
    if (Date.now() - start > timeLimit * 0.7) break
    bestMove = getBestMoveAtDepth(game, depth)
  }

  self.postMessage({ move: bestMove, gameId })
}
