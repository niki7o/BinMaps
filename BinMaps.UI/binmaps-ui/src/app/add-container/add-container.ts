import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

declare const L: any;

interface Area {
  id: string;
  name: string;
  riskLevel: string;
  color: string;
  fillMultiplier: number;
  zoneMultiplier: number;
}

interface ExistingContainer {
  id: number;
  areaId: string;
  locationX: number; 
  locationY: number; 
  trashType: number;
  status: number;
  hasSensor: boolean;
}

interface NearestInfo {
  container: ExistingContainer;
  distanceMeters: number;
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
 
  areas: Area[] = [];
  areaId = '';
  trashType: 0 | 1 | 2 | 3 = 0; 
  capacity = 1100;
  hasSensor = false;
  lat: number | null = null;
  lng: number | null = null;

 
  loadingAreas = true;
  loadingContainers = true;
  submitting = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;
  formTouched = false;

 
  nearest: NearestInfo | null = null;

 
  readonly conflictDistanceMeters = 15;
  
  readonly warnDistanceMeters = 40;

  private map?: any;
  private placedMarker?: any;
  private existingLayer?: any; 
  private highlightLayer?: any;  

  private readonly pinIcon = () =>
    L.divIcon({
      className: 'add-container-pin',
      html:
        '<div class="pin-body">' +
          '<div class="pin-dot"></div>' +
        '</div>' +
        '<div class="pin-shadow"></div>',
      iconSize: [32, 42],
      iconAnchor: [16, 40],
      popupAnchor: [0, -36]
    });

  private readonly existingIcon = (color: string) =>
    L.divIcon({
      className: 'existing-container-dot',
      html: `<span style="--c:${color}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

  private areaFeatures: { id: string; ring: number[][] }[] = [];

  /** Existing containers, loaded once on init. */
  private existingContainers: ExistingContainer[] = [];

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
    this.loadExistingContainers();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private initMap(): void {
    this.map = L.map('add-container-map', {
      center: environment.region.center,
      zoom: environment.region.defaultZoom,
      minZoom: 11,
      maxZoom: 18,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: ''
    }).addTo(this.map);

    this.existingLayer = L.layerGroup().addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.setLocation(lat, lng);
    });
  }

  private setLocation(lat: number, lng: number): void {
    this.lat = +lat.toFixed(6);
    this.lng = +lng.toFixed(6);

    this.areaId = this.findAreaForPoint(this.lat, this.lng) ?? '';

    this.recomputeNearest();

    if (this.placedMarker) {
      this.placedMarker.setLatLng([lat, lng]);
    } else {
      this.placedMarker = L.marker([lat, lng], {
        draggable: true,
        icon: this.pinIcon()
      }).addTo(this.map);

      this.placedMarker.on('drag', (e: any) => {
        const p = e.target.getLatLng();
        this.lat = +p.lat.toFixed(6);
        this.lng = +p.lng.toFixed(6);
        this.recomputeNearest();
      });

      this.placedMarker.on('dragend', (e: any) => {
        const p = e.target.getLatLng();
        this.lat = +p.lat.toFixed(6);
        this.lng = +p.lng.toFixed(6);
        this.areaId = this.findAreaForPoint(this.lat, this.lng) ?? '';
        this.recomputeNearest();
      });
    }

    this.updateMarkerConflictStyle();
  }

  private updateMarkerConflictStyle(): void {
    if (!this.placedMarker) return;
    const el = this.placedMarker.getElement?.();
    if (!el) return;
    el.classList.toggle('conflict', this.hasConflict);
    el.classList.toggle('warn', this.hasWarning && !this.hasConflict);
  }

  private loadExistingContainers(): void {
   
    this.http.get<ExistingContainer[]>(
      `${environment.apiUrl}/containers`,
      { headers: this.authHeaders() }
    ).subscribe({
      next: rows => {
        this.existingContainers = rows ?? [];
        this.loadingContainers = false;
        this.renderExistingContainers();
      },
      error: err => {
        this.loadingContainers = false;
        console.warn('Failed to load existing containers', err);
       
      }
    });
  }

  private renderExistingContainers(): void {
    if (!this.existingLayer) return;
    this.existingLayer.clearLayers();

    for (const c of this.existingContainers) {
      
      const dot = L.marker([c.locationY, c.locationX], {
        icon: this.existingIcon('rgba(120,140,160,0.85)'),
        interactive: true,
        keyboard: false,
        riseOnHover: true
      }).bindTooltip(
        `Контейнер #${c.id} · ${this.trashTypeLabel(c.trashType)}`,
        { direction: 'top', offset: [0, -6] }
      );

      const exclusion = L.circle([c.locationY, c.locationX], {
        radius: this.conflictDistanceMeters,
        color: '#ef4444',
        weight: 1,
        opacity: 0.35,
        fillColor: '#ef4444',
        fillOpacity: 0.06,
        interactive: false
      });

      this.existingLayer.addLayer(exclusion);
      this.existingLayer.addLayer(dot);
    }
  }

  private trashTypeLabel(t: number): string {
    return this.trashTypeOptions.find(x => x.value === t)?.label ?? 'Неизв.';
  }

  private recomputeNearest(): void {
    if (this.lat === null || this.lng === null ||
        this.existingContainers.length === 0) {
      this.nearest = null;
      this.updateMarkerConflictStyle();
      return;
    }

    let best: NearestInfo | null = null;
    for (const c of this.existingContainers) {
      const d = this.haversineMeters(
        this.lat, this.lng, c.locationY, c.locationX);
      if (best === null || d < best.distanceMeters) {
        best = { container: c, distanceMeters: d };
      }
    }
    this.nearest = best;
    this.updateMarkerConflictStyle();
  }

  private haversineMeters(
    lat1: number, lng1: number,
    lat2: number, lng2: number
  ): number {
    const R = 6_371_000;
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Public getters for the template.
  get hasConflict(): boolean {
    return this.nearest !== null &&
           this.nearest.distanceMeters < this.conflictDistanceMeters;
  }

  get hasWarning(): boolean {
    return this.nearest !== null &&
           this.nearest.distanceMeters >= this.conflictDistanceMeters &&
           this.nearest.distanceMeters < this.warnDistanceMeters;
  }

  get nearestText(): string | null {
    if (!this.nearest) return null;
    const d = this.nearest.distanceMeters;
    const id = this.nearest.container.id;
    const type = this.trashTypeLabel(this.nearest.container.trashType);
    return `Контейнер #${id} (${type}) на ${d.toFixed(1)} м`;
  }

  get existingContainersCount(): number {
    return this.existingContainers.length;
  }

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

  get derivedAreaName(): string | null {
    if (!this.areaId) return null;
    return this.areas.find(a => a.id === this.areaId)?.name ?? this.areaId;
  }

  get locationOutsideAreas(): boolean {
    return this.lat !== null && this.lng !== null && !this.areaId;
  }

  private loadAreas(): void {
    const headers = this.authHeaders();
    this.http.get<Area[]>(`${environment.apiUrl}/areas`, { headers }).subscribe({
      next: areas => {
        this.areas = areas;
        this.loadingAreas = false;
      },
      error: err => {
        this.loadingAreas = false;
        this.errorMessage = 'Неуспешно зареждане на зоните. Опитайте отново.';
        console.error('Failed to load areas', err);
      }
    });
  }

  get canSubmit(): boolean {
    return (
      !this.submitting &&
      !!this.areaId &&
      this.lat !== null &&
      this.lng !== null &&
      this.capacity >= 100 &&
      this.capacity <= 100_000 &&
      !this.hasConflict
    );
  }

  get inBounds(): boolean {
    if (this.lat === null || this.lng === null) return true;
    return this.lat >= 42.55 && this.lat <= 42.85 &&
           this.lng >= 23.15 && this.lng <= 23.50;
  }

  onSubmit(): void {
    this.formTouched = true;
    this.successMessage = null;
    this.errorMessage = null;

    if (this.hasConflict && this.nearest) {
      this.errorMessage =
        `Твърде близо до контейнер #${this.nearest.container.id} ` +
        `(${this.nearest.distanceMeters.toFixed(1)} м). Минимум ` +
        `${this.conflictDistanceMeters} м. Преместете пина.`;
      return;
    }

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
      .post<ExistingContainer>(
        `${environment.apiUrl}/containers`,
        payload,
        { headers: this.authHeaders() }
      )
      .subscribe({
        next: created => {
          this.submitting = false;
          this.successMessage =
            `Контейнер #${created?.id ?? '?'} е добавен успешно.`;

          if (created?.id != null) {
            this.existingContainers = [...this.existingContainers, {
              id: created.id,
              areaId: this.areaId,
              locationX: this.lng!,
              locationY: this.lat!,
              trashType: this.trashType,
              status: 0,
              hasSensor: this.hasSensor
            }];
            this.renderExistingContainers();
          }

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
    this.nearest = null;
  }

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
    this.nearest = null;
  }

  cancel(): void {
    this.router.navigate(['/admin']);
  }
}
