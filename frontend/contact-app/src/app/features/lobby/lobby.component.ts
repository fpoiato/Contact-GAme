import { NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { MIN_PLAYERS, Player, RelayPayload } from '../../core/models/ws-types';
import { GameEngineService } from '../../core/services/game-engine.service';
import { RoomService } from '../../core/services/room.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';
import { LoadingButtonComponent } from '../../shared/loading-button.component';
import { SpinnerComponent } from '../../shared/spinner.component';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [NgClass, TranslateModule, LanguageToggleComponent, LoadingButtonComponent, SpinnerComponent],
  templateUrl: './lobby.component.html',
})
export class LobbyComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly roomService = inject(RoomService);
  private readonly gameEngine = inject(GameEngineService);
  private readonly ws = inject(WebSocketService);
  private readonly translate = inject(TranslateService);

  roomCode = '';
  players: Player[] = [];
  pending: Player[] = [];
  isHost = false;
  copied = false;
  copying = false;
  sharing = false;
  starting = false;
  approvingIds = new Set<string>();
  rejectingIds = new Set<string>();
  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
    void this.restoreLobbySession();
    this.sub = this.roomService.listenForLobbyUpdates().subscribe();
    this.sub.add(
      this.ws.messages$.subscribe((msg) => {
        if (msg.action === 'RELAY') {
          const relay = msg.payload as RelayPayload;
          if (relay.type === 'GAME_STARTED') {
            this.gameEngine.init();
            this.router.navigate(['/game', this.roomCode]);
          }
        }
      })
    );
    this.sub.add(this.roomService.players$.subscribe((p) => (this.players = p)));
    this.sub.add(
      this.roomService.pending$.subscribe((p) => {
        this.pending = p;
        const pendingIds = new Set(p.map((x) => x.connectionId));
        this.approvingIds = new Set([...this.approvingIds].filter((id) => pendingIds.has(id)));
        this.rejectingIds = new Set([...this.rejectingIds].filter((id) => pendingIds.has(id)));
      })
    );
    this.sub.add(
      this.roomService.room$.subscribe((r) => {
        this.isHost = r?.isHost ?? false;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  approve(id: string): void {
    this.approvingIds.add(id);
    this.roomService.approvePlayer(id);
    this.clearActionLoading(id, 'approve');
  }

  reject(id: string): void {
    this.rejectingIds.add(id);
    this.roomService.rejectPlayer(id);
    this.clearActionLoading(id, 'reject');
  }

  isApproving(id: string): boolean {
    return this.approvingIds.has(id);
  }

  isRejecting(id: string): boolean {
    return this.rejectingIds.has(id);
  }

  get inviteUrl(): string {
    return this.roomService.getInviteUrl(this.roomCode);
  }

  get canNativeShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  async copyLink(): Promise<void> {
    if (this.copying || this.copied) return;
    this.copying = true;
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2500);
    } finally {
      this.copying = false;
    }
  }

  shareWhatsApp(): void {
    window.open(this.roomService.getWhatsAppUrl(this.roomCode), '_blank', 'noopener,noreferrer');
  }

  async shareNative(): Promise<void> {
    if (!this.canNativeShare || this.sharing) return;
    this.sharing = true;
    try {
      await navigator.share({
        title: this.translate.instant('APP_TITLE'),
        text: this.translate.instant('SHARE_TEXT', { roomCode: this.roomCode }),
        url: this.inviteUrl,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        await this.copyLink();
      }
    } finally {
      this.sharing = false;
    }
  }

  startGame(): void {
    if (this.players.length < MIN_PLAYERS || this.starting) return;
    this.starting = true;
    this.gameEngine.startGame();
    this.router.navigate(['/game', this.roomCode]);
  }

  private clearActionLoading(id: string, action: 'approve' | 'reject'): void {
    setTimeout(() => {
      if (action === 'approve') this.approvingIds.delete(id);
      else this.rejectingIds.delete(id);
    }, 5000);
  }

  canStart(): boolean {
    return this.isHost && this.players.length >= MIN_PLAYERS;
  }

  private async restoreLobbySession(): Promise<void> {
    const restored = await this.roomService.tryRestoreSession(this.roomCode);
    if (!restored) {
      void this.router.navigate(['/'], { queryParams: { room: this.roomCode } });
    }
  }
}
