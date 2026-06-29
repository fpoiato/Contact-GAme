import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { MIN_PLAYERS, Player, RelayPayload } from '../../core/models/ws-types';
import { GameEngineService } from '../../core/services/game-engine.service';
import { RoomService } from '../../core/services/room.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [TranslateModule, LanguageToggleComponent],
  templateUrl: './lobby.component.html',
})
export class LobbyComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly roomService = inject(RoomService);
  private readonly gameEngine = inject(GameEngineService);
  private readonly ws = inject(WebSocketService);

  roomCode = '';
  players: Player[] = [];
  pending: Player[] = [];
  isHost = false;
  copied = false;
  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
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
    this.sub.add(this.roomService.pending$.subscribe((p) => (this.pending = p)));
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
    this.roomService.approvePlayer(id);
  }

  reject(id: string): void {
    this.roomService.rejectPlayer(id);
  }

  async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.roomService.getInviteUrl(this.roomCode));
    this.copied = true;
    setTimeout(() => (this.copied = false), 2000);
  }

  shareWhatsApp(): void {
    window.open(this.roomService.getWhatsAppUrl(this.roomCode), '_blank');
  }

  startGame(): void {
    if (this.players.length < MIN_PLAYERS) return;
    this.gameEngine.startGame();
    this.router.navigate(['/game', this.roomCode]);
  }

  canStart(): boolean {
    return this.isHost && this.players.length >= MIN_PLAYERS;
  }
}
