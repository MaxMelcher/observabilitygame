import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError } from 'rxjs';
import { AppInsightsService } from '../services/app-insights.service';
import { environment } from '../../environments/environment';

interface PlayerScore {
  playerName: string;
  time: number;  // time in milliseconds
  created: Date;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private apiUrl = environment.API; // Update with your backend URL

  constructor(
    private http: HttpClient,
    private appInsights: AppInsightsService
  ) { }

  getTopScores(): Observable<PlayerScore[]> {
    this.appInsights.trackEvent('GetTopScores');
    return this.http.get<PlayerScore[]>(`${this.apiUrl}/scores`).pipe(
      catchError(error => {
        this.appInsights.trackException(error);
        throw error;
      })
    );
  }

  submitScore(score: PlayerScore): Observable<PlayerScore> {
    this.appInsights.trackEvent('SubmitScore', { playerName: score.playerName, time: score.time });
    return this.http.post<PlayerScore>(`${this.apiUrl}/scores`, score).pipe(
      catchError(error => {
        this.appInsights.trackException(error);
        throw error;
      })
    );
  }
}
