import { parseSquareName } from 'shogiops/util';

export type PlayerColor = 'sente' | 'gote';
export type HeatmapTone = 'ally' | 'enemy';

export type BoardPiece = {
  color: PlayerColor;
  role: string;
};

export type ShogiPositionLike = {
  board: {
    get(square: unknown): BoardPiece | null | undefined;
  };
};

export type SquareCoords = {
  x: number;
  y: number;
};

const BOARD_FILES = ['9', '8', '7', '6', '5', '4', '3', '2', '1'] as const;
const BOARD_RANKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;

export const BOARD_SQUARES: string[] = BOARD_RANKS.flatMap((rank) =>
  BOARD_FILES.map((file) => `${file}${rank}`),
);

export function getHeatmapColor(count: number, tone: HeatmapTone): string {
  if (count <= 0) return 'transparent';

  const alpha = Math.min(count, 5) * 0.2;
  return tone === 'ally' ? `rgba(0, 128, 0, ${alpha})` : `rgba(220, 38, 38, ${alpha})`;
}

export function getOpponentColor(color: PlayerColor): PlayerColor {
  return color === 'sente' ? 'gote' : 'sente';
}

export function createDefenderHeatmap(
  position: ShogiPositionLike,
  defenderSide: PlayerColor,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const originSquare of BOARD_SQUARES) {
    const piece = getPieceAt(position, originSquare);
    if (!piece || piece.color !== defenderSide) continue;

    const influencedSquares = collectInfluencedSquares(position, originSquare, piece.role, piece.color);

    for (const targetSquare of influencedSquares) {
      counts.set(targetSquare, (counts.get(targetSquare) ?? 0) + 1);
    }
  }

  return counts;
}

function collectInfluencedSquares(
  position: ShogiPositionLike,
  originSquare: string,
  role: string,
  color: PlayerColor,
): string[] {
  const origin = squareNameToCoords(originSquare);
  if (!origin) return [];

  const squares = new Set<string>();
  const forward = color === 'sente' ? -1 : 1;
  const backward = -forward;

  const addStep = (dx: number, dy: number) => {
    const target = coordsToSquareName(origin.x + dx, origin.y + dy);
    if (target) squares.add(target);
  };

  const addRay = (dx: number, dy: number) => {
    let x = origin.x + dx;
    let y = origin.y + dy;

    while (isInsideBoard(x, y)) {
      const target = coordsToSquareName(x, y);
      if (!target) break;

      squares.add(target);

      if (getPieceAt(position, target)) {
        break;
      }

      x += dx;
      y += dy;
    }
  };

  switch (role) {
    case 'king':
      addStep(-1, -1);
      addStep(0, -1);
      addStep(1, -1);
      addStep(-1, 0);
      addStep(1, 0);
      addStep(-1, 1);
      addStep(0, 1);
      addStep(1, 1);
      break;

    case 'pawn':
      addStep(0, forward);
      break;

    case 'gold':
    case 'tokin':
    case 'promotedsilver':
    case 'promotedknight':
    case 'promotedlance':
      addStep(-1, forward);
      addStep(0, forward);
      addStep(1, forward);
      addStep(-1, 0);
      addStep(1, 0);
      addStep(0, backward);
      break;

    case 'silver':
      addStep(-1, forward);
      addStep(0, forward);
      addStep(1, forward);
      addStep(-1, backward);
      addStep(1, backward);
      break;

    case 'knight':
      addStep(-1, forward * 2);
      addStep(1, forward * 2);
      break;

    case 'lance':
      addRay(0, forward);
      break;

    case 'bishop':
      addRay(-1, -1);
      addRay(1, -1);
      addRay(-1, 1);
      addRay(1, 1);
      break;

    case 'rook':
      addRay(0, -1);
      addRay(0, 1);
      addRay(-1, 0);
      addRay(1, 0);
      break;

    case 'horse':
      addRay(-1, -1);
      addRay(1, -1);
      addRay(-1, 1);
      addRay(1, 1);
      addStep(0, -1);
      addStep(0, 1);
      addStep(-1, 0);
      addStep(1, 0);
      break;

    case 'dragon':
      addRay(0, -1);
      addRay(0, 1);
      addRay(-1, 0);
      addRay(1, 0);
      addStep(-1, -1);
      addStep(1, -1);
      addStep(-1, 1);
      addStep(1, 1);
      break;

    default:
      break;
  }

  return [...squares];
}

function getPieceAt(position: ShogiPositionLike, squareName: string): BoardPiece | null {
  const parsedSquare = parseSquareName(squareName);
  if (parsedSquare === undefined) return null;

  return position.board.get(parsedSquare) ?? null;
}

function squareNameToCoords(squareName: string): SquareCoords | null {
  if (squareName.length !== 2) return null;

  const file = squareName[0];
  const rank = squareName[1];
  const x = BOARD_FILES.indexOf(file as (typeof BOARD_FILES)[number]);
  const y = BOARD_RANKS.indexOf(rank as (typeof BOARD_RANKS)[number]);

  if (x === -1 || y === -1) return null;

  return { x, y };
}

function coordsToSquareName(x: number, y: number): string | null {
  if (!isInsideBoard(x, y)) return null;
  return `${BOARD_FILES[x]}${BOARD_RANKS[y]}`;
}

function isInsideBoard(x: number, y: number): boolean {
  return x >= 0 && x < 9 && y >= 0 && y < 9;
}
