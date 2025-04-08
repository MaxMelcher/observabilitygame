import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

interface Score {
  playerName: string;
  time: number;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private apiUrl = 'http://localhost:5000/api'; // Will connect to backend later

  constructor(private http: HttpClient) {}

  // Stub implementation until backend is ready
  submitScore(score: Score): Observable<any> {
    console.log('Score submitted:', score);
    return of({ success: true });
  }

  // Stub implementation until backend is ready
  getLeaderboard(): Observable<Score[]> {
    return of([
      { playerName: 'Player 1', time: 30 },
      { playerName: 'Player 2', time: 45 },
      { playerName: 'Player 3', time: 60 }
    ]);
  }
}
