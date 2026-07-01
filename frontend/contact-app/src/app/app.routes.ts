import { Routes } from '@angular/router';
import { GameRoomComponent } from './features/game/game-room.component';
import { RoundScoreboardComponent } from './features/game/round-scoreboard.component';
import { LandingComponent } from './features/landing/landing.component';
import { LobbyComponent } from './features/lobby/lobby.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'lobby/:roomCode', component: LobbyComponent },
  { path: 'game/:roomCode', component: GameRoomComponent },
  { path: 'game/:roomCode/scoreboard', component: RoundScoreboardComponent },
  { path: '**', redirectTo: '' },
];
