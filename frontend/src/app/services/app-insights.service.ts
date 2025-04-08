import { Injectable } from '@angular/core';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { AngularPlugin } from '@microsoft/applicationinsights-angularplugin-js';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AppInsightsService {
  private angularPlugin: AngularPlugin;
  private appInsights: ApplicationInsights;

  constructor(private router: Router) {
    this.angularPlugin = new AngularPlugin();
    this.appInsights = new ApplicationInsights({
      config: {
        connectionString: 'YOUR_APP_INSIGHTS_CONNECTION_STRING',
        enableAutoRouteTracking: true,
        extensions: [this.angularPlugin],
        extensionConfig: {
          [this.angularPlugin.identifier]: { router: this.router }
        }
      }
    });
  }

  init(): void {
    this.appInsights.loadAppInsights();
    this.appInsights.trackPageView();
  }

  trackEvent(name: string, properties?: { [key: string]: any }): void {
    this.appInsights.trackEvent({ name }, properties);
  }

  trackException(exception: Error, properties?: { [key: string]: any }): void {
    this.appInsights.trackException({ exception, properties });
  }
}