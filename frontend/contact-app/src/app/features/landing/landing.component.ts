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
    const roomParam = params.get('room');
    const urlRoom = roomParam ? roomParam.toUpperCase().slice(0, 5) : null;
    if (urlRoom) {
      this.roomCode = urlRoom;
      this.joinMode = true;
    }

    const saved = this.session.load();
    if (saved?.nickname) {
      this.nickname = saved.nickname;
    }
    if (saved?.roomCode && !urlRoom) {
      this.roomCode = saved.roomCode.toUpperCase();
    }

    // Invite links (?room=) take priority over a stale stored session.
    if (urlRoom && saved?.roomCode && saved.roomCode.toUpperCase() !== urlRoom) {
      this.roomService.reset();
    }

    void this.tryAutoReconnect(urlRoom);
  }

  private async tryAutoReconnect(urlRoom: string | null): Promise<void> {
    const saved = this.session.load();
    if (!saved?.roomCode || !saved.nickname) return;
    if (urlRoom && saved.roomCode.toUpperCase() !== urlRoom) return;

    this.reconnecting = true;
    this.gameEngine.init();
    try {
      const code = await this.roomService.tryAutoReconnect(urlRoom);
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
