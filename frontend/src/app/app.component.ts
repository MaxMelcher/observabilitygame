import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AppInsightsService } from './services/app-insights.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.sass'
})
export class AppComponent implements OnInit {
  title = 'frontend';

  constructor(private appInsightsService: AppInsightsService) {}

  ngOnInit(): void {
    this.appInsightsService.init();
  }
}
