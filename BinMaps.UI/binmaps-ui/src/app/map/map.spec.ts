import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MapComponent } from './map';
import { AuthService } from '../services/auth.service';
import { ContainerSignalRService } from '../services/signalr.service';
import { of } from 'rxjs';

describe('MapComponent', () => {
  let component: MapComponent;
  let fixture: ComponentFixture<MapComponent>;

  beforeEach(async () => {
    const mockAuthService = jasmine.createSpyObj('AuthService', ['getAuthHeaders', 'hasRole', 'getToken'], {
      currentUser$: of(null),
      currentUser: null,
      isAuthenticated: false
    });
    mockAuthService.getAuthHeaders.and.returnValue({ headers: {} as any });
    mockAuthService.hasRole.and.returnValue(false);
    mockAuthService.getToken.and.returnValue(null);

    const mockSignalRService = jasmine.createSpyObj('ContainerSignalRService', ['start', 'stop'], {
      containerUpdates$: of([])
    });

    await TestBed.configureTestingModule({
      imports: [MapComponent],
      providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: ContainerSignalRService, useValue: mockSignalRService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MapComponent);
    component = fixture.componentInstance;
    spyOn(component, 'ngAfterViewInit').and.callFake(() => {});
    fixture.detectChanges();
  });

  afterEach(() => {
    if (fixture) fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});