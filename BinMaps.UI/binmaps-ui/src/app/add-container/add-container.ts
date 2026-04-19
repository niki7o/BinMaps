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

  // Custom CSS-based marker — avoids Leaflet's default PNG icons,
  // which do not bundle reliably through Angular (the default image
  // path resolves relative to the CSS, not to the final built asset).
  private readonly pinIcon = () =>
    L.divIcon({
      className: 'add-container-pin',
      html:
        '<div class="pin-body">' +
          '<div class="pin-dot"></div>' +
        '</div>' +
        '<div class="pin-shadow"></div>',
      iconSize: [32, 42],
      iconAnchor: [16, 40],   // tip of the pin
      popupAnchor: [0, -36]
    });

  // ── Area polygons (loaded from assets/data/areas.geojson) ─────────
  // Used to derive the Area from map click: the admin should not be
  // able to place a bin in the city centre while tagging it as
  // "Надежда север". Area membership is a pure function of location.
  private areaFeatures: { id: string; ring: number[][] }[] = [];

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
    this.loadAreaFeatures();
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

    // Area is derived from coordinates — admin cannot override.
    this.areaId = this.findAreaForPoint(this.lat, this.lng) ?? '';

    if (this.placedMarker) {
      this.placedMarker.setLatLng([lat, lng]);
    } else {
      this.placedMarker = L.marker([lat, lng], {
        draggable: true,
        icon: this.pinIcon()
      }).addTo(this.map);

      this.placedMarker.on('dragend', (e: any) => {
        const p = e.target.getLatLng();
        this.lat = +p.lat.toFixed(6);
        this.lng = +p.lng.toFixed(6);
        this.areaId = this.findAreaForPoint(this.lat, this.lng) ?? '';
      });
    }
  }

  // ── Area detection from coordinates ───────────────────────────────
  private loadAreaFeatures(): void {
    this.http.get<any>('assets/data/areas.geojson').subscribe({
      next: gj => {
        this.areaFeatures = (gj?.features ?? [])
          .map((f: any) => ({
            id: f?.properties?.id as string,
            ring: (f?.geometry?.coordinates?.[0] ?? []) as number[][]
          }))
          .filter((x: { id: string; ring: number[][] }) =>
            !!x.id && x.ring.length >= 3
          );
      },
      error: err => console.warn('Failed to load areas.geojson', err)
    });
  }

  private findAreaForPoint(lat: number, lng: number): string | null {
    for (const f of this.areaFeatures) {
      if (this.pointInPolygon(lat, lng, f.ring)) return f.id;
    }
    return null;
  }

  /** Ray-casting point-in-polygon. `ring` is GeoJSON [[lng, lat], ...]. */
  private pointInPolygon(lat: number, lng: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect =
        ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Helper for the template (shows the derived area's name).
  get derivedAreaName(): string | null {
    if (!this.areaId) return null;
    return this.areas.find(a => a.id === this.areaId)?.name ?? this.areaId;
  }

  // True when the admin has placed a pin but the pin falls outside
  // every known area polygon — submission must be blocked.
  get locationOutsideAreas(): boolean {
    return this.lat !== null && this.lng !== null && !this.areaId;
  }

  // ── Areas ─────────────────────────────────────────────────────────
  private loadAreas(): void {
    const headers = this.authHeaders();
    this.http.get<Area[]>(`${environment.apiUrl}/areas`, { headers }).subscribe({
      next: areas => {
        this.areas = areas;
        this.loadingAreas = false;
        // Do NOT auto-select an area here — area is derived from the
        // clicked map location. See setLocation() / findAreaForPoint().
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
    this.areaId = '';
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
    this.areaId = '';
  }

  cancel(): void {
    this.router.navigate(['/admin']);
  }
}
