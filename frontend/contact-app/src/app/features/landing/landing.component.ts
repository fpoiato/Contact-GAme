import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GameEngineService } from '../../core/services/game-engine.service';
import { RoomService } from '../../core/services/room.service';
import { SessionService } from '../../core/services/session.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';
import { LoadingButtonComponent } from '../../shared/loading-button.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, TranslateModule, LanguageToggleComponent, LoadingButtonComponent],
  templateUrl: './landing.component.html',
})
export class LandingComponent implements OnInit {
  private readonly roomService = inject(RoomService);
  private readonly gameEngine = inject(GameEngineService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  nickname = '';
  roomCode = '';
  loading = false;
  error = '';
  joinMode = false;
  reconnecting = false;

  guideOpen = false;

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      this.roomCode = room.toUpperCase().slice(0, 5);
      this.joinMode = true;
    }

    const saved = this.session.load();
    if (saved?.nickname) {
      this.nickname = saved.nickname;
    }
    if (saved?.roomCode && !room) {
      this.roomCode = saved.roomCode.toUpperCase();
    }

    void this.tryAutoReconnect();
  }

  private async tryAutoReconnect(): Promise<void> {
    const saved = this.session.load();
    if (!saved?.roomCode || !saved.nickname) return;

    this.reconnecting = true;
    this.gameEngine.init();
    try {
      const code = await this.roomService.tryAutoReconnect();
      if (!code) return;

      const route = await this.gameEngine.resolveRouteAfterReconnect();
      if (route === 'game') {
        await this.router.navigate(['/game', code]);
      } else {
        await this.router.navigate(['/lobby', code]);
      }
    } catch {
      // Stay on landing with session prefilled
    } finally {
      this.reconnecting = false;
    }
  }

  showJoin(): void {
    this.joinMode = true;
    this.error = '';
  }

  cancelJoin(): void {
    this.joinMode = false;
    this.error = '';
  }

  async createGame(): Promise<void> {
    if (!this.nickname.trim()) return;
    this.loading = true;
    this.error = '';
    try {
      const code = await this.roomService.createRoom(this.nickname.trim());
      await this.router.navigate(['/lobby', code]);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }

  async joinGame(): Promise<void> {
    if (!this.nickname.trim() || this.roomCode.trim().length !== 5) return;
    this.loading = true;
    this.error = '';
    try {
      await this.roomService.joinRoom(this.nickname.trim(), this.roomCode.trim());
      await this.router.navigate(['/lobby', this.roomCode.toUpperCase()]);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.loading = false;
    }
  }
}
