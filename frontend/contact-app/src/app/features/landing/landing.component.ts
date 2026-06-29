import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { RoomService } from '../../core/services/room.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, TranslateModule, LanguageToggleComponent],
  templateUrl: './landing.component.html',
})
export class LandingComponent implements OnInit {
  private readonly roomService = inject(RoomService);
  private readonly router = inject(Router);

  nickname = '';
  roomCode = '';
  loading = false;
  error = '';

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      this.roomCode = room.toUpperCase().slice(0, 5);
    }
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
