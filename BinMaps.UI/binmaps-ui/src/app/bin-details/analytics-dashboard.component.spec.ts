import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AnalyticsDashboardComponent } from './analytics-dashboard.component';
import { AuthService } from '../services/auth.service';
import { of } from 'rxjs';

describe('AnalyticsDashboardComponent', () => {
  let component: AnalyticsDashboardComponent;
  let fixture: ComponentFixture<AnalyticsDashboardComponent>;

  beforeEach(async () => {
    const mockAuthService = jasmine.createSpyObj('AuthService', ['getAuthHeaders', 'hasRole'], {
      currentUser$: of(null),
      currentUser: null,
      isAuthenticated: false
    });
    mockAuthService.getAuthHeaders.and.returnValue({ headers: {} as any });
    mockAuthService.hasRole.and.returnValue(false);

    await TestBed.configureTestingModule({
      imports: [AnalyticsDashboardComponent],
      providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize stats object', () => {
    expect(component.stats).toBeDefined();
    expect(typeof component.stats.totalBins).toBe('number');
    expect(typeof component.stats.avgFill).toBe('number');
    expect(typeof component.stats.criticalBins).toBe('number');
  });

  it('should have empty clusters initially', () => {
    expect(component.clusters).toBeDefined();
    expect(Array.isArray(component.clusters)).toBeTrue();
  });

  it('should have empty zoneStats initially', () => {
    expect(component.zoneStats).toBeDefined();
    expect(Array.isArray(component.zoneStats)).toBeTrue();
  });
});
