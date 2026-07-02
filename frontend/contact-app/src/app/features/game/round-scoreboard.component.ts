import { NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { GameState, Player } from '../../core/models/ws-types';
import { GameEngineService } from '../../core/services/game-engine.service';
import { RoomService } from '../../core/services/room.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';
import { LeaveGameButtonComponent } from '../../shared/leave-game-button.component';
import { LoadingButtonComponent } from '../../shared/loading-button.component';
import { SpinnerComponent } from '../../shared/spinner.component';

interface RankedPlayer {
  player: Player;
  score: number;
  rank: number;
}

@Component({
  selector: 'app-round-scoreboard',
  standalone: true,
  imports: [NgClass, TranslateModule, LanguageToggleComponent, LeaveGameButtonComponent, LoadingButtonComponent, SpinnerComponent],
  templateUrl: './round-scoreboard.component.html',
})
export class RoundScoreboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameEngine = inject(GameEngineService);
  private readonly roomService = inject(RoomService);

  roomCode = '';
  state: GameState | null = null;
  rankedPlayers: RankedPlayer[] = [];
  continuing = false;
  loadError = false;
  reconnectGrace: number | null = null;

  private sessionReady = false;

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
    void this.initSession();

    this.subs.push(
      this.gameEngine.state$.subscribe((s) => {
        this.state = s;
        if (s) this.loadError = false;
        if (s?.players) {
          this.rankedPlayers = this.buildRankings(s);
        }
        if (s && s.phase !== 'ROUND_COMPLETE' && s.phase !== 'LOBBY') {
          this.router.navigate(['/game', this.roomCode]);
        } else if (s?.phase === 'LOBBY') {
          this.router.navigate(['/lobby', this.roomCode]);
        }
      }),
      this.gameEngine.stateRecoveryFailed$.subscribe((failed) => {
        if (failed) this.loadError = true;
      }),
      this.gameEngine.reconnectGrace$.subscribe((g) => (this.reconnectGrace = g)),
    );
  }

  private async initSession(): Promise<void> {
    const restored = await this.roomService.tryRestoreSession(this.roomCode);
    if (!restored) {
      void this.router.navigate(['/'], { queryParams: { room: this.roomCode } });
      return;
    }
    this.sessionReady = true;
    if (!this.gameEngine.state) {
      if (this.roomService.room?.isHost) {
        this.gameEngine.requestHostStateRecovery();
      } else {
        this.gameEngine.requestGameState();
      }
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  get isHost(): boolean {
    return this.gameEngine.isHost;
  }

  get myId(): string | null {
    return this.gameEngine.myId;
  }

  get completedRound(): number {
    return Math.max(1, (this.state?.currentRound ?? 1));
  }

  rankLabel(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  continueRound(): void {
    if (this.continuing) return;
    this.continuing = true;
    this.gameEngine.continueToNextRound();
    this.router.navigate(['/game', this.roomCode]);
    setTimeout(() => (this.continuing = false), 3000);
  }

  private buildRankings(state: GameState): RankedPlayer[] {
    const sorted = [...state.players].sort((a, b) => {
      const scoreDiff = (state.scores?.[b.connectionId] ?? 0) - (state.scores?.[a.connectionId] ?? 0);
      return scoreDiff !== 0 ? scoreDiff : a.joinOrder - b.joinOrder;
    });

    let rank = 0;
    let prevScore: number | null = null;
    return sorted.map((player, index) => {
      const score = state.scores?.[player.connectionId] ?? 0;
      if (prevScore === null || score < prevScore) {
        rank = index + 1;
        prevScore = score;
      }
      return { player, score, rank };
    });
  }
}
