import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { Shogiground } from 'shogiground';
import { initialSfen, makeSfen, parseSfen } from 'shogiops/sfen';
import { checksSquareNames, shogigroundDropDests, shogigroundMoveDests } from 'shogiops/compat';
import { parseSquareName } from 'shogiops/util';
import type { Rules } from 'shogiops/types';
import { pieceCanPromote, pieceForcePromote, promote, unpromote } from 'shogiops/variant/util';
import {
  HistoryBranchView,
  HistoryTreeView,
  MoveHistoryComponent,
  MoveNode,
} from './move-history/move-history';

@Component({
  selector: 'app-shogiban',
  imports: [MoveHistoryComponent],
  templateUrl: './shogiban.html',
  styleUrl: './shogiban.css',
  encapsulation: ViewEncapsulation.None,
})
export class Shogiban implements AfterViewInit {
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

  public currentNodeId = 'root';
  public nodesById: Record<string, MoveNode> = {};
  private nodeSeq = 0;

  ngAfterViewInit(): void {
    if (!this.boardRef?.nativeElement) {
      console.error('Le conteneur #board est introuvable');
      return;
    }

    this.initializePosition();
    this.initializeGround();
    this.attachGround();
    this.syncGroundFromState();
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
    });
  }

  private promotesToRole(role: string): string | undefined {
    return promote(this.rules)(role as any) as string | undefined;
  }

  private unpromotesToRole(role: string): string | undefined {
    return unpromote(this.rules)(role as any) as string | undefined;
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
      role: piece.role as any,
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

  public goToNode(nodeId: string): void {
    const node = this.nodesById[nodeId];
    if (!node) return;

    this.position = parseSfen(this.rules, node.sfenAfter).unwrap();
    this.currentNodeId = nodeId;
    this.syncGroundFromState();
    this.cdr.detectChanges();
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
}
