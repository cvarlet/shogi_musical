import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { Shogiground } from 'shogiground';
import { checksSquareNames, shogigroundDropDests, shogigroundMoveDests } from 'shogiops/compat';
import { initialSfen, makeSfen, parseSfen } from 'shogiops/sfen';
import { parseSquareName } from 'shogiops/util';
import { pieceCanPromote, pieceForcePromote, promote, unpromote } from 'shogiops/variant/util';
import { BoardHeatmapOverlayComponent } from './board-heatmap/board-heatmap-overlay';
import {
  BOARD_SQUARES,
  createDefenderHeatmap,
  type PlayerColor,
} from './defenders/defender-heatmap';
import {
  HistoryBranchView,
  HistoryTreeView,
  MoveHistoryComponent,
  MoveNode,
} from './move-history/move-history';
import { BoardArrowsOverlayComponent, type BoardArrow } from './board-arrows/board-arrows-overlay';
import kifuParser from 'kifu-parser';
import type { Role, Rules } from 'shogiops/types';

type NativeDrawableShape = {
  orig?: string;
  dest?: string;
};

type ParsedKifuMove = {
  turn: boolean;
  to: [number, number];
  from: [number, number];
  piece: number;
  time?: number;
};

type ParsedKifuSource = {
  comment?: string;
  move?: ParsedKifuMove;
  special?: string;
  variations?: ParsedKifuSource[][];
};

type ParsedKifu = {
  header?: any;
  initial?: any;
  sources?: ParsedKifuSource[];
};

const KIF_PIECE_TO_ROLE: Record<number, Role> = {
  1: 'pawn',
  2: 'lance',
  3: 'knight',
  4: 'silver',
  5: 'gold',
  6: 'bishop',
  7: 'rook',
  8: 'king',
  9: 'tokin',
  10: 'promotedlance',
  11: 'promotedknight',
  12: 'promotedsilver',
  13: 'horse',
  14: 'dragon',
};

@Component({
  selector: 'app-shogiban',
  imports: [MoveHistoryComponent, BoardHeatmapOverlayComponent, BoardArrowsOverlayComponent],
  templateUrl: './shogiban.html',
  styleUrl: './shogiban.css',
  encapsulation: ViewEncapsulation.None,
})
export class Shogiban implements OnInit, AfterViewInit {
  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  @ViewChild('board') boardRef?: ElementRef<HTMLElement>;
  @ViewChild('handLeft') handTopRef?: ElementRef<HTMLElement>;
  @ViewChild('handRight') handBottomRef?: ElementRef<HTMLElement>;

  private ground?: ReturnType<typeof Shogiground>;

  private readonly rules: Rules = 'standard';
  private readonly initialSfenString = initialSfen(this.rules);
  private position?: any;

  public readonly boardSquares = BOARD_SQUARES;
  public readonly ownSide: PlayerColor = 'sente';
  public readonly opponentSide: PlayerColor = 'gote';

  public showOwnDefenders = false;
  public showOpponentDefenders = false;
  public ownDefenderCounts = new Map<string, number>();
  public opponentDefenderCounts = new Map<string, number>();

  public currentNodeId = 'root';
  public nodesById: Record<string, MoveNode> = {};
  private nodeSeq = 0;

  public showLastMoveHighlight = true;

  public analysisArrows: BoardArrow[] = [
    // {
    //   orig: '7g',
    //   dest: '7f',
    //   color: '#ec4899',
    //   strokeWidth: 0.06,
    //   opacity: 0.95,
    // },
  ];

  public hoveredArrowId: string | null = null;
  public activeArrowTool: 'draw' | 'erase' = 'draw';

  private arrowSeq = 0;

  public selectedArrowColor = '#ec4899';
  public readonly arrowPresetColors = [
    '#111111', // noir
    '#dc2626', // rouge
    '#2563eb', // bleu
    '#b91c1c', // rouge foncé
    '#ec4899', // rose
    '#16a34a', // vert
  ];

  ngOnInit(): void {
    this.initializePosition();
  }

  ngAfterViewInit(): void {
    if (!this.boardRef?.nativeElement) {
      console.error('Le conteneur #board est introuvable');
      return;
    }

    this.initializeGround();
    this.attachGround();
    this.syncGroundFromState();
  }

  get heatmapDescription(): string {
    if (this.showOwnDefenders && this.showOpponentDefenders) {
      return 'Vert : mes pièces. Rouge : pièces adverses. Si une case est contrôlée par les deux camps, elle s’affiche rouge en haut et vert en bas.';
    }

    if (this.showOwnDefenders) {
      return 'Heatmap des cases contrôlées par mes pièces (camp du bas).';
    }

    if (this.showOpponentDefenders) {
      return 'Heatmap des cases contrôlées par les pièces adverses (camp du haut).';
    }

    return 'Affiche une heatmap des cases contrôlées.';
  }

  toggleLastMoveHighlight(): void {
    this.showLastMoveHighlight = !this.showLastMoveHighlight;
  }

  toggleOwnDefenders(): void {
    this.showOwnDefenders = !this.showOwnDefenders;

    if (this.showOwnDefenders) {
      this.recomputeOwnDefenderHeatmap();
    }
  }

  toggleOpponentDefenders(): void {
    this.showOpponentDefenders = !this.showOpponentDefenders;

    if (this.showOpponentDefenders) {
      this.recomputeOpponentDefenderHeatmap();
    }
  }

  public goToNode(nodeId: string): void {
    const node = this.nodesById[nodeId];
    if (!node) return;

    this.position = parseSfen(this.rules, node.sfenAfter).unwrap();
    this.currentNodeId = nodeId;
    this.syncGroundFromState();
    this.cdr.detectChanges();
  }

  public get historyTree(): HistoryTreeView | null {
    const root = this.nodesById['root'];
    if (!root) return null;

    const [mainlineStartId, ...rootVariationIds] = root.childrenIds;

    return {
      mainline: mainlineStartId ? this.buildHistoryBranch(mainlineStartId, 1, false) : null,
      rootVariations: rootVariationIds.map((variationId) =>
        this.buildHistoryBranch(variationId, 1, false),
      ),
    };
  }

  private initializePosition(): void {
    this.position = parseSfen(this.rules, this.initialSfenString).unwrap();

    this.nodesById = {
      root: {
        id: 'root',
        parentId: null,
        childrenIds: [],
        side: null,
        kind: 'root',
        label: 'Début',
        sfenAfter: this.initialSfenString,
      },
    };

    this.currentNodeId = 'root';
    this.nodeSeq = 0;
  }

  private initializeGround(): void {
    this.ground = Shogiground();
  }

  private attachGround(): void {
    if (!this.ground || !this.boardRef?.nativeElement) return;

    this.ground.attach({
      board: this.boardRef.nativeElement,
    });

    if (this.handTopRef?.nativeElement) {
      this.ground.attach({
        hands: {
          top: this.handTopRef.nativeElement,
        },
      });
    }

    if (this.handBottomRef?.nativeElement) {
      this.ground.attach({
        hands: {
          bottom: this.handBottomRef.nativeElement,
        },
      });
    }
  }

  private syncGroundFromState(): void {
    if (!this.ground || !this.position) return;

    this.recomputeVisibleHeatmaps();

    const sfen = makeSfen(this.position);
    const [board, turn, hands] = sfen.split(' ');

    this.ground.set({
      sfen: {
        board,
        hands: hands === '-' ? '' : hands,
      },

      orientation: 'sente',
      turnColor: turn === 'w' ? 'gote' : 'sente',
      activeColor: turn === 'w' ? 'gote' : 'sente',

      selected: undefined,
      selectedPiece: undefined,
      hovered: undefined,

      movable: {
        free: false,
        showDests: true,
        dests: shogigroundMoveDests(this.position),
        events: {
          after: (orig, dest, prom) => {
            this.ngZone.run(() => {
              this.handleNormalMove(orig, dest, prom);
            });
          },
        },
      },

      droppable: {
        free: false,
        showDests: true,
        dests: this.computeDropDests(),
        events: {
          after: (piece, key, prom) => {
            this.ngZone.run(() => {
              this.handleDrop(piece, key, prom);
            });
          },
        },
      },

      promotion: {
        promotesTo: (role) => this.promotesToRole(role),
        unpromotesTo: (role) => this.unpromotesToRole(role),

        movePromotionDialog: (orig, dest) => {
          return this.canPromoteOnMove(orig, dest) && !this.mustPromoteOnMove(orig, dest);
        },

        forceMovePromotion: (orig, dest) => {
          return this.mustPromoteOnMove(orig, dest);
        },
      },

      checks: checksSquareNames(this.position),

      drawable: {
        enabled: true,
        visible: false,
        onChange: (shapes) => {
          this.ngZone.run(() => {
            this.handleDrawableChange(shapes as NativeDrawableShape[]);
          });
        },
      },

      disableContextMenu: true,
    });
  }

  private recomputeOwnDefenderHeatmap(): void {
    if (!this.position) return;
    this.ownDefenderCounts = createDefenderHeatmap(this.position, this.ownSide);
  }

  private recomputeOpponentDefenderHeatmap(): void {
    if (!this.position) return;
    this.opponentDefenderCounts = createDefenderHeatmap(this.position, this.opponentSide);
  }

  private recomputeVisibleHeatmaps(): void {
    if (this.showOwnDefenders) {
      this.recomputeOwnDefenderHeatmap();
    }

    if (this.showOpponentDefenders) {
      this.recomputeOpponentDefenderHeatmap();
    }
  }

  private promotesToRole(role: string): string | undefined {
    return promote(this.rules)(role as never) as string | undefined;
  }

  private unpromotesToRole(role: string): string | undefined {
    return unpromote(this.rules)(role as never) as string | undefined;
  }

  private handleNormalMove(orig: string, dest: string, prom: boolean): void {
    if (!this.position) return;

    const from = parseSquareName(orig);
    const to = parseSquareName(dest);

    if (from === undefined || to === undefined) {
      this.syncGroundFromState();
      return;
    }

    const move = {
      from,
      to,
      promotion: prom || undefined,
    };

    if (!this.position.isLegal(move)) {
      this.syncGroundFromState();
      return;
    }

    const side = this.currentSideFromPosition();
    const label = this.buildMoveLabel(orig, dest, !!prom);

    this.position.play(move);

    const sfenAfter = makeSfen(this.position);

    this.appendChildNode({
      side,
      kind: 'move',
      label,
      from: orig,
      to: dest,
      promotion: !!prom,
      sfenAfter,
    });

    this.syncGroundFromState();
    this.cdr.detectChanges();
  }

  private computeDropDests() {
    if (!this.position) return new Map();
    return shogigroundDropDests(this.position);
  }

  private handleDrop(piece: { role: string }, key: string, _prom: boolean): void {
    if (!this.position) return;

    const to = parseSquareName(key);

    if (to === undefined) {
      this.syncGroundFromState();
      return;
    }

    const dropMove = {
      role: piece.role as never,
      to,
    };

    if (!this.position.isLegal(dropMove)) {
      this.syncGroundFromState();
      return;
    }

    const side = this.currentSideFromPosition();
    const label = this.buildDropLabel(piece.role, key);

    this.position.play(dropMove);

    const sfenAfter = makeSfen(this.position);

    this.appendChildNode({
      side,
      kind: 'drop',
      label,
      role: piece.role,
      to: key,
      sfenAfter,
    });

    this.syncGroundFromState();
    this.cdr.detectChanges();
  }

  private canPromoteOnMove(orig: string, dest: string): boolean {
    if (!this.position) return false;

    const from = parseSquareName(orig);
    const to = parseSquareName(dest);

    if (from === undefined || to === undefined) return false;

    const piece = this.position.board.get(from);
    if (!piece) return false;

    const capture = this.position.board.get(to);

    return pieceCanPromote(this.rules)(piece, from, to, capture);
  }

  private mustPromoteOnMove(orig: string, dest: string): boolean {
    if (!this.position) return false;

    const from = parseSquareName(orig);
    const to = parseSquareName(dest);

    if (from === undefined || to === undefined) return false;

    const piece = this.position.board.get(from);
    if (!piece) return false;

    return pieceForcePromote(this.rules)(piece, to);
  }

  private currentSideFromPosition(): 'sente' | 'gote' {
    if (!this.position) return 'sente';

    const sfen = makeSfen(this.position);
    const [, turn] = sfen.split(' ');

    return turn === 'w' ? 'gote' : 'sente';
  }

  private buildMoveLabel(orig: string, dest: string, promotion: boolean): string {
    return `${orig}${dest}${promotion ? '+' : ''}`;
  }

  private buildDropLabel(role: string, dest: string): string {
    return `${role}*${dest}`;
  }

  private createNodeId(): string {
    this.nodeSeq += 1;
    return `n${this.nodeSeq}`;
  }

  private appendChildNode(entry: Omit<MoveNode, 'id' | 'parentId' | 'childrenIds'>): void {
    const parentId = this.currentNodeId;
    const parentNode = this.nodesById[parentId];

    if (!parentNode) return;

    const existingChildId = parentNode.childrenIds.find((childId) => {
      const child = this.nodesById[childId];
      return child?.sfenAfter === entry.sfenAfter;
    });

    if (existingChildId) {
      this.currentNodeId = existingChildId;
      return;
    }

    const newId = this.createNodeId();

    const newNode: MoveNode = {
      id: newId,
      parentId,
      childrenIds: [],
      ...entry,
    };

    this.nodesById = {
      ...this.nodesById,
      [newId]: newNode,
      [parentId]: {
        ...parentNode,
        childrenIds: [...parentNode.childrenIds, newId],
      },
    };

    this.currentNodeId = newId;
  }

  private getMainChildId(nodeId: string): string | undefined {
    const node = this.nodesById[nodeId];
    if (!node || node.childrenIds.length === 0) return undefined;
    return node.childrenIds[0];
  }

  private buildHistoryBranch(
    startNodeId: string,
    startPly: number,
    includeSiblingVariationsOnFirstMove: boolean,
  ): HistoryBranchView {
    const moves: HistoryBranchView['moves'] = [];

    let currentId: string | undefined = startNodeId;
    let ply = startPly;
    let isFirstMove = true;

    while (currentId) {
      const node = this.nodesById[currentId];
      if (!node || node.kind === 'root') break;

      let variations: HistoryBranchView[] = [];

      if (!(isFirstMove && !includeSiblingVariationsOnFirstMove)) {
        const parent = node.parentId !== null ? this.nodesById[node.parentId] : undefined;
        const siblingIds = parent?.childrenIds.filter((childId) => childId !== currentId) ?? [];
        variations = siblingIds.map((siblingId) => this.buildHistoryBranch(siblingId, ply, false));
      }

      moves.push({
        nodeId: node.id,
        label: node.label,
        ply,
        side: node.side as 'sente' | 'gote',
        variations,
      });

      currentId = this.getMainChildId(currentId);
      ply += 1;
      isFirstMove = false;
    }

    return {
      startNodeId,
      moves,
    };
  }

  private handleDrawableChange(shapes: NativeDrawableShape[]): void {
    if (!shapes.length) return;

    const latestShape = shapes[shapes.length - 1];
    if (!latestShape?.orig || !latestShape?.dest) {
      this.clearNativeDrawableShapes();
      return;
    }

    // clic droit simple sur une case => cercle natif
    // pour l'instant on l'ignore
    if (latestShape.orig === latestShape.dest) {
      this.clearNativeDrawableShapes();
      return;
    }

    this.analysisArrows = [
      ...this.analysisArrows,
      {
        id: this.nextArrowId(),
        orig: latestShape.orig,
        dest: latestShape.dest,
        color: this.selectedArrowColor,
        strokeWidth: 0.06,
        opacity: 0.95,
      },
    ];

    this.clearNativeDrawableShapes();
    this.cdr.detectChanges();
  }

  private clearNativeDrawableShapes(): void {
    this.ground?.set({
      drawable: {
        shapes: [],
      },
    });
  }

  private nextArrowId(): string {
    this.arrowSeq += 1;
    return `arrow-${this.arrowSeq}`;
  }

  setArrowTool(tool: 'draw' | 'erase'): void {
    this.activeArrowTool = tool;
  }

  onArrowColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value?.trim();

    if (!value) return;

    this.setArrowColor(value);
  }

  setArrowColor(color: string): void {
    const value = color?.trim();

    if (!value) return;

    this.selectedArrowColor = value;
  }

  onArrowHover(arrowId: string | null): void {
    this.hoveredArrowId = arrowId;
  }

  onArrowClick(arrowId: string): void {
    if (this.activeArrowTool === 'erase') {
      this.analysisArrows = this.analysisArrows.filter((arrow) => arrow.id !== arrowId);

      if (this.hoveredArrowId === arrowId) {
        this.hoveredArrowId = null;
      }

      this.cdr.detectChanges();
      return;
    }

    // plus tard :
    // recolor
    // annotate
    // select
  }

  async onKifuFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    try {
      const text = await file.text();
      this.importKifText(text);
    } catch (error) {
      console.error('Import KIF impossible :', error);
    } finally {
      input.value = '';
    }
  }

  private importKifText(text: string): void {
    const normalizedText = this.normalizeKifForParser(text);

    const parsed = kifuParser(normalizedText, 'Kif', false) as ParsedKifu;
    console.log('KIF parsé :', parsed);

    this.loadParsedKifuMainline(parsed);
  }

  private normalizeKifForParser(text: string): string {
    const lines = text
      .replace(/^\uFEFF/, '') // enlève un éventuel BOM
      .replace(/\r\n/g, '\n')
      .split('\n');

    return lines
      .map((line) => {
        // On cible uniquement les lignes de coups :
        // ex: "   1   ７六歩(77)"
        if (!/^\s*\d+\s+/.test(line)) {
          return line;
        }

        // Si la ligne a déjà un temps KIF à la fin, on ne touche à rien.
        // ex: "( 0:03/00:00:03)"
        if (/\(\s*\d+:\d{2}(?:\+\d+)?\s*\/\s*\d+:\d{2}:\d{2}\s*\)\s*$/.test(line)) {
          return line;
        }

        // Sinon on ajoute un faux temps pour éviter le bug de la librairie
        return `${line}   ( 0:00/00:00:00)`;
      })
      .join('\n');
  }

  private loadParsedKifuMainline(parsed: ParsedKifu): void {
    // V1 : on repart toujours de la position standard
    // donc pas encore de gestion des handicaps / positions initiales custom
    this.initializePosition();

    this.analysisArrows = [];
    this.hoveredArrowId = null;

    const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];

    for (const source of sources) {
      if (!source?.move) continue;

      const ok = this.applyImportedMove(source.move);

      if (!ok) {
        console.warn('Coup KIF ignoré ou illégal :', source.move);
        break;
      }
    }

    this.syncGroundFromState();
    this.cdr.detectChanges();
  }

  private applyImportedMove(move: ParsedKifuMove): boolean {
    if (!this.position) return false;

    const toKey = this.kifCoordToSquareKey(move.to);
    if (!toKey) return false;

    const to = parseSquareName(toKey);
    if (to === undefined) return false;

    const isDrop =
      Array.isArray(move.from) &&
      move.from.length === 2 &&
      move.from[0] === 0 &&
      move.from[1] === 0;

    const targetRole = KIF_PIECE_TO_ROLE[move.piece];
    if (!targetRole) return false;

    if (isDrop) {
      const dropMove = {
        role: targetRole,
        to,
      };

      if (!this.position.isLegal(dropMove)) {
        return false;
      }

      const side = this.currentSideFromPosition();
      const label = this.buildDropLabel(targetRole, toKey);

      this.position.play(dropMove);

      const sfenAfter = makeSfen(this.position);

      this.appendChildNode({
        side,
        kind: 'drop',
        label,
        role: targetRole,
        to: toKey,
        sfenAfter,
      });

      return true;
    }

    const fromKey = this.kifCoordToSquareKey(move.from);
    if (!fromKey) return false;

    const from = parseSquareName(fromKey);
    if (from === undefined) return false;

    const pieceBefore = this.position.board.get(from);
    if (!pieceBefore) return false;

    const promotion = this.inferImportedPromotion(pieceBefore.role as Role, targetRole);

    const normalMove = {
      from,
      to,
      promotion: promotion || undefined,
    };

    if (!this.position.isLegal(normalMove)) {
      return false;
    }

    const side = this.currentSideFromPosition();
    const label = this.buildMoveLabel(fromKey, toKey, promotion);

    this.position.play(normalMove);

    const sfenAfter = makeSfen(this.position);

    this.appendChildNode({
      side,
      kind: 'move',
      label,
      from: fromKey,
      to: toKey,
      promotion,
      sfenAfter,
    });

    return true;
  }

  private inferImportedPromotion(beforeRole: Role, afterRole: Role): boolean {
    if (beforeRole === afterRole) {
      return false;
    }

    return this.promotesToRole(beforeRole) === afterRole;
  }

  private kifCoordToSquareKey(coord?: [number, number]): string | null {
    if (!coord || coord.length !== 2) return null;

    const [file, rank] = coord;

    const rankLetter = ['?', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'][rank];
    if (!rankLetter || rankLetter === '?') return null;

    return `${file}${rankLetter}`;
  }
}
