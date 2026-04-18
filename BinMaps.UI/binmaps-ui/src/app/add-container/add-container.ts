import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

declare const L: any; // Leaflet is loaded globally via index.html

interface Area {
  id: string;
  name: string;
  riskLevel: string;
  color: string;
  fillMultiplier: number;
  zoneMultiplier: number;
}

interface ApiProblem {
  title?: string;
  detail?: string;
  status?: number;
}

@Component({
  selector: 'app-add-container',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './add-container.html',
  styleUrls: ['./add-container.css']
})
export class AddContainerComponent implements AfterViewInit, OnDestroy {
  // ── Form state ────────────────────────────────────────────────────
  areas: Area[] = [];
  areaId = '';
  trashType: 0 | 1 | 2 | 3 = 0; // Mixed=0, Plastic=1, Paper=2, Glass=3
  capacity = 1100;
  hasSensor = false;
  lat: number | null = null;
  lng: number | null = null;

  // ── UI state ──────────────────────────────────────────────────────
  loadingAreas = true;
  submitting = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;
  formTouched = false;

  // ── Map refs ──────────────────────────────────────────────────────
  private map?: any;
  private placedMarker?: any;

  readonly trashTypeOptions = [
    { value: 0 as const, label: 'Смесен' },
    { value: 1 as const, label: 'Пластмаса' },
    { value: 2 as const, label: 'Хартия' },
    { value: 3 as const, label: 'Стъкло' }
  ];

  constructor(
    private http: HttpClient,
    private router: Router,
    private auth: AuthService
  ) {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadAreas();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // ── Map ───────────────────────────────────────────────────────────
  private initMap(): void {
    this.map = L.map('add-container-map', {
      center: environment.region.center,
      zoom: environment.region.defaultZoom,
      minZoom: 11,
      maxZoom: 18
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.setLocation(lat, lng);
    });
  }

  private setLocation(lat: number, lng: number): void {
    this.lat = +lat.toFixed(6);
    this.lng = +lng.toFixed(6);

    if (this.placedMarker) {
      this.placedMarker.setLatLng([lat, lng]);
    } else {
      this.placedMarker = L.marker([lat, lng], {
        draggable: true
      }).addTo(this.map);

      this.placedMarker.on('dragend', (e: any) => {
        const p = e.target.getLatLng();
        this.lat = +p.lat.toFixed(6);
        this.lng = +p.lng.toFixed(6);
      });
    }
  }

  // ── Areas ─────────────────────────────────────────────────────────
  private loadAreas(): void {
    const headers = this.authHeaders();
    this.http.get<Area[]>(`${environment.apiUrl}/areas`, { headers }).subscribe({
      next: areas => {
        this.areas = areas;
        this.loadingAreas = false;
        if (areas.length > 0 && !this.areaId) {
          this.areaId = areas[0].id;
        }
      },
      error: err => {
        this.loadingAreas = false;
        this.errorMessage = 'Неуспешно зареждане на зоните. Опитайте отново.';
        console.error('Failed to load areas', err);
      }
    });
  }

  // ── Validation (client-side) ──────────────────────────────────────
  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !!this.areaId &&
      this.lat !== null &&
      this.lng !== null &&
      this.capacity >= 100 &&
      this.capacity <= 100_000
    );
  }

  get inBounds(): boolean {
    if (this.lat === null || this.lng === null) return true;
    return this.lat >= 42.55 && this.lat <= 42.85 &&
           this.lng >= 23.15 && this.lng <= 23.50;
  }

  // ── Submit ────────────────────────────────────────────────────────
  onSubmit(): void {
    this.formTouched = true;
    this.successMessage = null;
    this.errorMessage = null;

    if (!this.canSubmit) {
      this.errorMessage = 'Моля, попълнете всички задължителни полета.';
      return;
    }

    if (!this.inBounds) {
      this.errorMessage = 'Координатите трябва да са в рамките на пилотната зона (София).';
      return;
    }

    this.submitting = true;

    const payload = {
      areaId: this.areaId,
      locationX: this.lng!,
      locationY: this.lat!,
      capacity: this.capacity,
      trashType: this.trashType,
      hasSensor: this.hasSensor
    };

    this.http
      .post(`${environment.apiUrl}/containers`, payload, { headers: this.authHeaders() })
      .subscribe({
        next: (created: any) => {
          this.submitting = false;
          this.successMessage =
            `Контейнер #${created?.id ?? '?'} е добавен успешно.`;
          this.resetFormKeepPosition();
        },
        error: err => {
          this.submitting = false;
          const p = err?.error as ApiProblem | undefined;
          this.errorMessage =
            p?.detail ??
            p?.title ??
            (err.status === 403
              ? 'Нямате права да добавяте контейнери.'
              : err.status === 409
                ? 'Контейнер вече съществува твърде близо до тази точка.'
                : 'Грешка при добавяне. Опитайте отново.');
        }
      });
  }

  private resetFormKeepPosition(): void {
    // Keep the selected location & area so the admin can drop several
    // containers in the same zone without re-selecting each time.
    this.capacity = 1100;
    this.trashType = 0;
    this.hasSensor = false;
    this.formTouched = false;
    if (this.placedMarker) {
      this.map.removeLayer(this.placedMarker);
      this.placedMarker = undefined;
    }
    this.lat = null;
    this.lng = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  private authHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  clearLocation(): void {
    if (this.placedMarker) {
      this.map.removeLayer(this.placedMarker);
      this.placedMarker = undefined;
    }
    this.lat = null;
    this.lng = null;
  }

  cancel(): void {
    this.router.navigate(['/admin']);
  }
}
