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
import { MoveHistoryComponent, type MoveHistoryEntry } from './move-history/move-history';

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

  public history: MoveHistoryEntry[] = [];
  private ply = 0;
  public currentPly = 0;

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
    this.history = [];
    this.currentPly = 0;
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

        events: {
          initiated: () => {
            console.log('Dialogue de promotion lancé');
          },
          after: (piece) => {
            console.log('Pièce choisie pour la promotion :', piece);
          },
          cancel: () => {
            console.log('Promotion annulée');
          },
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
    console.log('handleNormalMove called', { orig, dest, prom });

    if (!this.position) return;

    const from = parseSquareName(orig);
    const to = parseSquareName(dest);

    if (from === undefined || to === undefined) {
      console.warn('Case introuvable :', { orig, dest });
      this.syncGroundFromState();
      return;
    }

    const move = {
      from,
      to,
      promotion: prom || undefined,
    };

    if (!this.position.isLegal(move)) {
      console.warn('Coup illégal refusé :', move);
      this.syncGroundFromState();
      return;
    }

    const side = this.currentSideFromPosition();
    const label = this.buildMoveLabel(orig, dest, !!prom);

    this.position.play(move);

    const sfenAfter = makeSfen(this.position);

    this.pushMoveHistory({
      side,
      kind: 'move',
      label,
      from: orig,
      to: dest,
      promotion: !!prom,
      sfenAfter,
    });

    console.log('Coup joué :', move);
    console.log('Nouveau SFEN :', sfenAfter);

    this.syncGroundFromState();
  }

  private computeDropDests() {
    if (!this.position) return new Map();
    return shogigroundDropDests(this.position);
  }

  private handleDrop(piece: { role: string }, key: string, prom: boolean): void {
    console.log('handleDrop called', { piece, key, prom });
    if (!this.position) return;

    const to = parseSquareName(key);

    if (to === undefined) {
      console.warn('Case de drop introuvable :', key);
      this.syncGroundFromState();
      return;
    }

    const dropMove = {
      role: piece.role as any,
      to,
    };

    if (!this.position.isLegal(dropMove)) {
      console.warn('Drop illégal refusé :', dropMove);
      this.syncGroundFromState();
      return;
    }

    const side = this.currentSideFromPosition();
    const label = this.buildDropLabel(piece.role, key);

    this.position.play(dropMove);

    const sfenAfter = makeSfen(this.position);

    this.pushMoveHistory({
      side,
      kind: 'drop',
      label,
      to: key,
      role: piece.role,
      sfenAfter,
    });

    console.log('Drop joué :', dropMove, 'prom =', prom);
    console.log('Nouveau SFEN :', sfenAfter);

    this.syncGroundFromState();
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

  private pushMoveHistory(entry: Omit<MoveHistoryEntry, 'ply'>): void {
    if (this.currentPly < this.history.length) {
      this.history = this.history.slice(0, this.currentPly);
    }

    const nextPly = this.history.length + 1;

    this.history = [
      ...this.history,
      {
        ply: nextPly,
        ...entry,
      },
    ];

    this.currentPly = nextPly;

    console.log('history updated', this.history);
    console.log('history length', this.history.length);

    this.cdr.detectChanges();
  }

  public goToPly(ply: number): void {
    const sfen = ply === 0 ? this.initialSfenString : this.history[ply - 1]?.sfenAfter;

    if (!sfen) return;

    this.position = parseSfen(this.rules, sfen).unwrap();
    this.currentPly = ply;
    this.syncGroundFromState();
  }

  public goToPreviousPly(): void {
    if (this.currentPly <= 0) return;
    this.goToPly(this.currentPly - 1);
  }

  public goToNextPly(): void {
    if (this.currentPly >= this.history.length) return;
    this.goToPly(this.currentPly + 1);
  }

  public goToLastPly(): void {
    this.goToPly(this.history.length);
  }
}
