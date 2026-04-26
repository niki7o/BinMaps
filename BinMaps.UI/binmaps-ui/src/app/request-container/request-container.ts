import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

declare const L: any; // Leaflet is loaded globally via index.html

interface ApiProblem {
  title?: string;
  detail?: string;
  status?: number;
}

interface ExistingContainer {
  id: number;
  areaId: string;
  locationX: number; // lng
  locationY: number; // lat
  trashType: number;
  status: number;
  hasSensor: boolean;
}

// Mirrors BinMaps.Data.Entities.Enums.ReportType
const REPORT_TYPE_MISSING_CONTAINER = 'MissingContainer';

/**
 * Citizen-facing page — any authenticated User/Driver can propose a location
 * where they believe a new trash container should be placed. The proposal
 * becomes a Report of type MissingContainer which the admin reviews.
 */
@Component({
  selector: 'app-request-container',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './request-container.html',
  styleUrls: ['./request-container.css']
})
export class RequestContainerComponent implements AfterViewInit, OnDestroy {
  // ── Form state ────────────────────────────────────────────────────
  description = '';
  suggestedTrashType: number | null = null; // null = "няма предпочитание"
  photoFile: File | null = null;
  photoPreviewUrl: string | null = null;
  lat: number | null = null;
  lng: number | null = null;

  // ── UI state ──────────────────────────────────────────────────────
  submitting = false;
  successMessage: string | null = null;
  errorMessage: string | null = null;

  // ── Map refs ──────────────────────────────────────────────────────
  private map?: any;
  private placedMarker?: any;
  private existingLayer?: any;

  /** 15m exclusion zone — same threshold as add-container/backend. */
  readonly conflictDistanceMeters = 15;

  /** Loaded once on init for the visual orientation overlay. */
  private existingContainers: ExistingContainer[] = [];
  loadingContainers = true;

  private readonly existingIcon = (color: string) =>
    L.divIcon({
      className: 'existing-container-dot',
      html: `<span style="--c:${color}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

  // Same CSS-only pin as the admin add-container page — avoids the
  // default Leaflet PNG icon which doesn't resolve through Angular.
  private readonly pinIcon = () =>
    L.divIcon({
      className: 'request-container-pin',
      html:
        '<div class="pin-body">' +
          '<div class="pin-dot"></div>' +
        '</div>' +
        '<div class="pin-shadow"></div>',
      iconSize: [32, 42],
      iconAnchor: [16, 40],
      popupAnchor: [0, -36]
    });

  readonly trashTypeOptions = [
    { value: null, label: 'Няма предпочитание' },
    { value: 0, label: 'Смесен' },
    { value: 1, label: 'Пластмаса' },
    { value: 2, label: 'Хартия' },
    { value: 3, label: 'Стъкло' }
  ];

  // Match DB constraint on Report.Description (MaxLength 500)
  readonly descriptionMaxLength = 500;
  readonly descriptionMinLength = 20;

  constructor(
    private http: HttpClient,
    private router: Router,
    private auth: AuthService
  ) {}

  ngAfterViewInit(): void {
    this.initMap();
    this.loadExistingContainers();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }
  }

  // ── Map ───────────────────────────────────────────────────────────
  private initMap(): void {
    this.map = L.map('request-container-map', {
      center: environment.region.center,
      zoom: environment.region.defaultZoom,
      minZoom: 11,
      maxZoom: 18,
      // Drop the bottom-right "Leaflet | © OpenStreetMap" badge.
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: ''
    }).addTo(this.map);

    // LayerGroup for the static overlay of existing bins. Keeps the static
    // orientation layer separate from the user's draggable pin so we can
    // re-render only one without nuking the other.
    this.existingLayer = L.layerGroup().addTo(this.map);

    this.map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      this.setLocation(lat, lng);
    });
  }

  // ── Existing-container overlay ────────────────────────────────────
  private loadExistingContainers(): void {
    // /api/containers is AllowAnonymous — the bearer token is harmless if
    // the user happens to be logged in.
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
        // Non-fatal: the user can still propose a location, they just
        // lose the visual orientation overlay.
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

      // 15m exclusion ring matches backend rejection radius — gives the
      // citizen a hint that placing a pin inside the red ring makes the
      // proposal much less likely to be approved.
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

  /** Count of existing containers loaded from the API. */
  get existingContainersCount(): number {
    return this.existingContainers.length;
  }

  private setLocation(lat: number, lng: number): void {
    this.lat = +lat.toFixed(6);
    this.lng = +lng.toFixed(6);

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
      });
    }
  }

  clearLocation(): void {
    if (this.placedMarker) {
      this.map.removeLayer(this.placedMarker);
      this.placedMarker = undefined;
    }
    this.lat = null;
    this.lng = null;
  }

  // ── Photo ─────────────────────────────────────────────────────────
  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
      this.photoPreviewUrl = null;
    }

    if (file && file.type.startsWith('image/')) {
      this.photoFile = file;
      this.photoPreviewUrl = URL.createObjectURL(file);
    } else {
      this.photoFile = null;
    }
  }

  clearPhoto(): void {
    if (this.photoPreviewUrl) {
      URL.revokeObjectURL(this.photoPreviewUrl);
    }
    this.photoFile = null;
    this.photoPreviewUrl = null;
  }

  // ── Validation ────────────────────────────────────────────────────
  get inBounds(): boolean {
    if (this.lat === null || this.lng === null) return true;
    return this.lat >= 42.55 && this.lat <= 42.85 &&
           this.lng >= 23.15 && this.lng <= 23.50;
  }

  get canSubmit(): boolean {
    return (
      !this.submitting &&
      this.lat !== null &&
      this.lng !== null &&
      this.inBounds &&
      this.description.trim().length >= this.descriptionMinLength
    );
  }

  // ── Submit ────────────────────────────────────────────────────────
  onSubmit(): void {
    this.successMessage = null;
    this.errorMessage = null;

    if (!this.canSubmit) {
      this.errorMessage = 'Моля, маркирайте локация и попълнете описание (мин. 20 символа).';
      return;
    }

    this.submitting = true;

    const form = new FormData();
    form.append('ReportType', REPORT_TYPE_MISSING_CONTAINER);
    form.append('LocationX', String(this.lng));
    form.append('LocationY', String(this.lat));
    form.append('Description', this.description.trim());
    if (this.suggestedTrashType !== null) {
      // The backend currently has no dedicated column for suggested trash type.
      // We prepend it to the description so the admin sees it during review.
      const typeLabel =
        this.trashTypeOptions.find(o => o.value === this.suggestedTrashType)?.label ?? '';
      const prefix = typeLabel ? `[Предложен тип: ${typeLabel}] ` : '';
      form.set('Description', prefix + this.description.trim());
    }
    if (this.photoFile) {
      form.append('Photo', this.photoFile);
    }

    const headers = this.authHeaders();
    this.http
      .post(`${environment.apiUrl}/reports`, form, { headers })
      .subscribe({
        next: (res: any) => {
          this.submitting = false;
          this.successMessage =
            res?.message ??
            'Заявката е изпратена за преглед. Благодарим за приноса!';
          this.resetAfterSuccess();
        },
        error: err => {
          this.submitting = false;
          const p = err?.error as ApiProblem | undefined;
          this.errorMessage =
            p?.detail ??
            p?.title ??
            (err.status === 401
              ? 'Трябва да влезете в профила си преди да изпратите заявка.'
              : 'Грешка при изпращане. Опитайте отново.');
        }
      });
  }

  private resetAfterSuccess(): void {
    this.description = '';
    this.suggestedTrashType = null;
    this.clearLocation();
    this.clearPhoto();
  }

  // ── Helpers ───────────────────────────────────────────────────────
  private authHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  cancel(): void {
    this.router.navigate(['/map']);
  }
}
