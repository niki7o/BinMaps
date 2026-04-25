import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ConfirmService } from '../shared/confirm-dialog/confirm.service';
import { ToastService } from '../shared/toast/toast.service';
import { environment } from '../../environments/environment';

interface Report {
  id: number;
  trashContainerId: number | null;
  userId: string;
  userName: string;
  reportType: string;
  aiScore: number;
  userReputationOnSubmit: number;
  finalConfidence: number;
  isApproved: boolean | null;
  photoURL: string | null;
  description: string | null;
  createdAt: string;
}

interface Container {
  id: number;
  areaId: string;
  trashType: number;
  fillPercentage: number;
  status: number | null;
  hasSensor: boolean;
  temperature: number | null;
  batteryPercentage: number | null;
  isSeeded?: boolean;
}

interface DeletedContainer {
  id: number;
  areaId: string;
  trashType: number;
  locationX: number;
  locationY: number;
  capacity: number;
  hasSensor: boolean;
  deletedAt: string;
  deletedByUserId: string | null;
}

interface Truck {
  id: number;
  areaId: string;
  trashType: number;
  capacity: number;
  locationX: number;
  locationY: number;
}

interface User {
  id: string;
  userName: string;
  email: string;
  role: string;
  reputation: number;
  createdAt?: string;
  isBanned?: boolean;
  banReason?: string | null;
  bannedAt?: string | null;
}

interface AdminStats {
  totalContainers: number;
  criticalContainers: number;
  totalUsers: number;
  pendingReports: number;
  approvedReports: number;
  rejectedReports: number;
  averageFillPercent: number;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface PagedResponse {
  total: number;
  page: number;
  pageSize: number;
  items: Report[];
}

type ActiveTab = 'reports' | 'containers' | 'trucks' | 'users' | 'deleted' | 'routes';

export interface RouteRunSummary {
  id: number;
  driverId: string;
  driverName: string;
  areaId: string;
  trashType: number;
  truckId: number | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  plannedDistanceKm: number;
  plannedMinutes: number;
  collectedLoad: number;
  stopsCompleted: number;
  stopsPlanned: number;
  durationMinutes: number;
}

export interface RouteStopSnapshot {
  id: number;
  areaId: string;
  lat: number;
  lng: number;
  fill: number;
  capacity: number;
}

export interface RouteRunDetail extends RouteRunSummary {
  stops: RouteStopSnapshot[];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly API = environment.apiUrl;
  private readonly destroy$ = new Subject<void>();

  activeTab: ActiveTab = 'reports';

  reports: Report[] = [];
  filteredReports: Report[] = [];
  containers: Container[] = [];
  filteredContainers: Container[] = [];
  deletedContainers: DeletedContainer[] = [];
  trucks: Truck[] = [];
  users: User[] = [];
  filteredUsers: User[] = [];
  stats: AdminStats = {
    totalContainers: 0,
    criticalContainers: 0,
    totalUsers: 0,
    pendingReports: 0,
    approvedReports: 0,
    rejectedReports: 0,
    averageFillPercent: 0
  };

  userReportCounts: Record<string, number> = {};

  reportSearch = '';
  reportFilter = { status: '', reportType: '' };

  /** Reports selected by the admin for bulk delete. Keyed by report.id. */
  selectedReportIds = new Set<number>();

  /** When true, the reports table renders a checkbox column and the bulk-delete
   *  bar is shown. Toggled on by clicking "Изчисти", off by "Откажи" or after
   *  a successful delete. */
  isReportSelectMode = false;

  containerSearch = '';
  userSearch = '';

  selectedReport: Report | null = null;
  editingContainer: Container | null = null;
  reputationModal: { user: User; value: number } | null = null;
  banModal: { user: User; reason: string } | null = null;

  /** Set to true if the report photo <img> emits an `error` event — typically
   *  because the file is missing on the backend (Azure Container Apps volumes
   *  are ephemeral). The template swaps to a "snapshot unavailable" fallback
   *  with a direct link so the admin can still try to fetch it. */
  photoLoadFailed = false;

  toasts: Toast[] = [];
  private toastCounter = 0;

  isLoading = false;
 isResettingSensors = false;
  currentPage = 1;
  pageSize = 10;
  totalReports = 0;

  containerPage = 1;
  readonly containerPageSize = 10;

  get pagedContainers(): Container[] {
    const start = (this.containerPage - 1) * this.containerPageSize;
    return this.filteredContainers.slice(start, start + this.containerPageSize);
  }

  get containerTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredContainers.length / this.containerPageSize));
  }

  get containerPageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.containerPage - 2);
    const end = Math.min(this.containerTotalPages, this.containerPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  goToContainerPage(page: number): void {
    if (page < 1 || page > this.containerTotalPages) return;
    this.containerPage = page;
  }

  userPage = 1;
  readonly userPageSize = 10;

  get pagedUsers(): User[] {
    const start = (this.userPage - 1) * this.userPageSize;
    return this.filteredUsers.slice(start, start + this.userPageSize);
  }

  get userTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.userPageSize));
  }

  get userPageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.userPage - 2);
    const end = Math.min(this.userTotalPages, this.userPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  goToUserPage(page: number): void {
    if (page < 1 || page > this.userTotalPages) return;
    this.userPage = page;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalReports / this.pageSize));
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly confirmSvc: ConfirmService,
    private readonly toastSvc: ToastService,
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        if (user?.role === 'Admin') {
          this.loadStats();
          this.loadReports();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveTab(tab: ActiveTab): void {
    this.activeTab = tab;
    const loaders: Record<ActiveTab, () => void> = {
      reports: () => this.loadReports(),
      containers: () => this.loadContainers(),
      trucks: () => this.loadTrucks(),
      users: () => this.loadUsers(),
      deleted: () => this.loadDeletedContainers(),
      routes: () => this.loadRouteHistory()
    };
    loaders[tab]();
  }

  // ── Route history ────────────────────────────────────────────────────
  routeHistory: RouteRunSummary[] = [];
  filteredRoutes: RouteRunSummary[] = [];
  routeFilter: { status: string; areaId: string; driver: string } = {
    status: '',
    areaId: '',
    driver: '',
  };
  selectedRun: RouteRunDetail | null = null;
  isLoadingRoutes = false;

  loadRouteHistory(): void {
    this.isLoadingRoutes = true;
    const params: string[] = [];
    if (this.routeFilter.status) params.push(`status=${this.routeFilter.status}`);
    if (this.routeFilter.areaId) params.push(`areaId=${encodeURIComponent(this.routeFilter.areaId)}`);
    if (this.routeFilter.driver) params.push(`driverId=${encodeURIComponent(this.routeFilter.driver)}`);
    params.push('take=200');

    const url = `${this.API}/trucks/route/history?${params.join('&')}`;
    this.http.get<RouteRunSummary[]>(url, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.routeHistory = data ?? [];
          this.applyRouteFilters();
          this.isLoadingRoutes = false;
        },
        error: () => {
          this.isLoadingRoutes = false;
          this.showToast('Грешка при зареждане на маршрути', 'error');
        }
      });
  }

  applyRouteFilters(): void {
    const term = (this.routeFilter.driver ?? '').trim().toLowerCase();
    this.filteredRoutes = this.routeHistory.filter(r => {
      if (this.routeFilter.status && r.status !== this.routeFilter.status) return false;
      if (this.routeFilter.areaId && r.areaId !== this.routeFilter.areaId) return false;
      if (term && !(r.driverName ?? '').toLowerCase().includes(term)
          && !(r.driverId ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
  }

  openRunDetail(runId: number): void {
    this.http.get<RouteRunDetail>(`${this.API}/trucks/route/${runId}`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: d => { this.selectedRun = d; },
        error: () => this.showToast('Не мога да заредя детайлите за маршрута', 'error')
      });
  }

  closeRunDetail(): void {
    this.selectedRun = null;
  }

  // ── External API health check ───────────────────────────────────────
  apiHealth: {
    weather:  { name: string; ok: boolean; detail: string; elapsedMs: number };
    routing:  { name: string; ok: boolean; detail: string; elapsedMs: number };
    ai:       { name: string; ok: boolean; detail: string; elapsedMs: number };
    checkedAt: string;
  } | null = null;
  isCheckingApiHealth = false;

  /** Hits the admin diagnostics endpoint and stores the result. Bound to the
   *  "Провери API-та" button in the routes toolbar — the panel below the
   *  table renders one row per service with its status pill and ping time. */
  checkApiHealth(): void {
    if (this.isCheckingApiHealth) return;
    this.isCheckingApiHealth = true;
    this.http.get<typeof this.apiHealth>(
      `${this.API}/admin/diagnostics/apis`, this.authHeaders()
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.apiHealth = data;
          this.isCheckingApiHealth = false;
          const allOk = data && data.weather.ok && data.routing.ok && data.ai.ok;
          this.showToast(
            allOk ? 'Всички API-та работят' : 'Някои API-та имат проблем',
            allOk ? 'success' : 'info'
          );
        },
        error: () => {
          this.isCheckingApiHealth = false;
          this.showToast('Не успях да проверя външните API-та', 'error');
        }
      });
  }

  trashTypeLabel(t: number): string {
    return t === 0 ? 'Общ' : t === 1 ? 'Пластмаса' : t === 2 ? 'Хартия' : t === 3 ? 'Стъкло' : 'Неизв.';
  }

  loadDeletedContainers(): void {
    this.http.get<DeletedContainer[]>(`${this.API}/admin/containers/deleted`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => { this.deletedContainers = data; },
        error: () => this.showToast('Грешка при зареждане на архивираните контейнери', 'error')
      });
  }

  async restoreContainer(id: number): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: 'Възстановяване на контейнер',
      message: `Да върна ли контейнер #${id} от архива?`,
      confirmText: 'Възстанови',
      cancelText: 'Отказ',
      variant: 'info',
    });
    if (!ok) return;
    this.http.post(`${this.API}/admin/containers/${id}/restore`, {}, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.deletedContainers = this.deletedContainers.filter(c => c.id !== id);
          this.showToast(`Контейнер #${id} е възстановен`, 'success');
          this.loadStats();
        },
        error: () => this.showToast('Грешка при възстановяване', 'error')
      });
  }

  async deleteContainerFromAdmin(c: Container): Promise<void> {
    const ok = c.isSeeded
      ? await this.confirmSvc.ask({
          title: 'Архивиране на seed контейнер',
          message: `Да архивирам ли контейнер #${c.id}?`,
          detail: 'Seed контейнерите могат да бъдат възстановени по-късно от таб „Архивирани".',
          confirmText: 'Архивирай',
          cancelText: 'Отказ',
          variant: 'warning',
        })
      : await this.confirmSvc.ask({
          title: `Окончателно изтриване на контейнер #${c.id}`,
          message: 'Това действие е необратимо. Контейнерът и историята му ще бъдат изтрити за постоянно.',
          detail: `Зона: ${c.areaId} · Пълнене: ${c.fillPercentage.toFixed(0)}%`,
          confirmText: 'Изтрий окончателно',
          cancelText: 'Отказ',
          variant: 'danger',
          requireText: `DELETE ${c.id}`,
        });
    if (!ok) return;

    this.http.delete<{ id: number; mode: string }>(
      `${this.API}/containers/${c.id}`, this.authHeaders()
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.containers = this.containers.filter(x => x.id !== c.id);
          this.filteredContainers = this.filteredContainers.filter(x => x.id !== c.id);
          this.showToast(
            res.mode === 'soft'
              ? `Контейнер #${c.id} е архивиран`
              : `Контейнер #${c.id} е изтрит окончателно`,
            'success'
          );
          this.loadStats();
        },
        error: err => this.showToast(
          `Грешка: ${err?.error?.message ?? 'неуспешно изтриване'}`, 'error'
        )
      });
  }

  loadStats(): void {
    this.http.get<AdminStats>(`${this.API}/admin/stats`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => { this.stats = data; },
        error: () => this.showToast('Грешка при зареждане на статистики', 'error')
      });
  }

  loadReports(page = this.currentPage): void {
    this.isLoading = true;
    const statusParam = this.reportFilter.status ? `&status=${this.reportFilter.status}` : '';
    const typeParam = this.reportFilter.reportType ? `&reportType=${this.reportFilter.reportType}` : '';
    const url = `${this.API}/admin/reports?page=${page}&pageSize=${this.pageSize}${statusParam}${typeParam}`;
    this.http.get<PagedResponse>(url, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.totalReports = res.total;
          this.currentPage = res.page;
          this.reports = res.items;
          this.applyReportFilters();
          this.buildUserReportCounts();
          this.pruneSelectedReports();
          this.isLoading = false;
        },
        error: () => {
          this.showToast('Грешка при зареждане на сигнали', 'error');
          this.isLoading = false;
        }
      });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.loadReports(page);
  }

  loadContainers(): void {
    this.isLoading = true;
    this.http.get<Container[]>(`${this.API}/admin/containers`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.containers = data;
          this.filteredContainers = [...data];
          this.isLoading = false;
        },
        error: () => {
          this.showToast('Грешка при зареждане на контейнери', 'error');
          this.isLoading = false;
        }
      });
  }

  loadTrucks(): void {
    this.isLoading = true;
    this.http.get<Truck[]>(`${this.API}/admin/trucks`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => { this.trucks = data; this.isLoading = false; },
        error: () => {
          this.showToast('Грешка при зареждане на камиони', 'error');
          this.isLoading = false;
        }
      });
  }

  loadUsers(): void {
    this.isLoading = true;
    this.http.get<User[]>(`${this.API}/admin/users`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.users = data;
          this.filteredUsers = [...data];
          this.isLoading = false;
        },
        error: () => {
          this.showToast('Грешка при зареждане на потребители', 'error');
          this.isLoading = false;
        }
      });
  }

  applyReportFilters(): void {
    if (!this.reportSearch.trim()) {
      this.filteredReports = [...this.reports];
      return;
    }
    const q = this.reportSearch.toLowerCase();
    this.filteredReports = this.reports.filter(r =>
      r.userName.toLowerCase().includes(q) ||
      (r.trashContainerId?.toString() ?? '').includes(q) ||
      r.id.toString().includes(q)
    );
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadReports(1);
  }

  applyContainerSearch(): void {
    if (!this.containerSearch.trim()) {
      this.filteredContainers = [...this.containers];
    } else {
      const q = this.containerSearch.toLowerCase();
      this.filteredContainers = this.containers.filter(c =>
        c.areaId.toLowerCase().includes(q) ||
        c.id.toString().includes(q)
      );
    }
    this.containerPage = 1;
  }

  applyUserSearch(): void {
    if (!this.userSearch.trim()) {
      this.filteredUsers = [...this.users];
    } else {
      const q = this.userSearch.toLowerCase();
      this.filteredUsers = this.users.filter(u =>
        u.userName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    }
    this.userPage = 1;
  }

  get pendingCount(): number {
    return this.stats.pendingReports ?? 0;
  }

  approveReport(reportId: number): void {
    this.http.put(`${this.API}/reports/${reportId}/approve`, {}, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast('Сигналът е одобрен успешно');
          this.selectedReport = null;
          this.loadReports();
          this.loadStats();
        },
        error: () => this.showToast('Грешка при одобряване', 'error')
      });
  }

  rejectReport(reportId: number): void {
    this.http.put(`${this.API}/reports/${reportId}/reject`, {}, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast('Сигналът е отхвърлен');
          this.selectedReport = null;
          this.loadReports();
          this.loadStats();
        },
        error: () => this.showToast('Грешка при отхвърляне', 'error')
      });
  }

  // ───────────────────────────── Bulk delete ─────────────────────────────

  /** True if the given report is currently checked. */
  isReportSelected(reportId: number): boolean {
    return this.selectedReportIds.has(reportId);
  }

  /** Toggle a single row's checkbox. */
  toggleReportSelection(reportId: number): void {
    if (this.selectedReportIds.has(reportId)) {
      this.selectedReportIds.delete(reportId);
    } else {
      this.selectedReportIds.add(reportId);
    }
  }

  /** True when every report in the current filtered view is selected. */
  get allVisibleReportsSelected(): boolean {
    if (this.filteredReports.length === 0) return false;
    return this.filteredReports.every(r => this.selectedReportIds.has(r.id));
  }

  /** True when some but not all visible reports are selected — used for the
   *  indeterminate state of the header checkbox. */
  get someVisibleReportsSelected(): boolean {
    const anySelected = this.filteredReports.some(r => this.selectedReportIds.has(r.id));
    return anySelected && !this.allVisibleReportsSelected;
  }

  /** How many reports are currently checked (across all pages, not just visible). */
  get selectedReportCount(): number {
    return this.selectedReportIds.size;
  }

  /** Toggle "select all" — covers only the rows currently in view. */
  toggleSelectAllReports(): void {
    if (this.allVisibleReportsSelected) {
      this.filteredReports.forEach(r => this.selectedReportIds.delete(r.id));
    } else {
      this.filteredReports.forEach(r => this.selectedReportIds.add(r.id));
    }
  }

  /** Drop any checked reports that are no longer in the current page/filter.
   *  Called after a reload so we don't keep stale IDs forever. */
  private pruneSelectedReports(): void {
    if (this.selectedReportIds.size === 0) return;
    const visible = new Set(this.reports.map(r => r.id));
    for (const id of this.selectedReportIds) {
      if (!visible.has(id)) this.selectedReportIds.delete(id);
    }
  }

  clearReportSelection(): void {
    this.selectedReportIds.clear();
  }

  /** Cancel select mode entirely — hides checkboxes and clears any picks. */
  exitReportSelectMode(): void {
    this.selectedReportIds.clear();
    this.isReportSelectMode = false;
  }

  /**
   * "Изчисти" → enter select mode. The checkbox column appears so the admin
   * can pick individual reports to delete. Nothing is pre-selected — the
   * admin chooses each one explicitly. The header checkbox is still
   * available as a "select all visible" shortcut for power users.
   */
  enterReportSelectMode(): void {
    if (this.filteredReports.length === 0) return;
    this.isReportSelectMode = true;
    this.selectedReportIds.clear();
    // Scroll the toolbar into view so the user sees the new bulk-delete bar.
    queueMicrotask(() => {
      document.querySelector('.admin__toolbar-actions')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  async bulkDeleteSelectedReports(): Promise<void> {
    const ids = Array.from(this.selectedReportIds);
    if (ids.length === 0) return;

    const ok = await this.confirmSvc.ask({
      title: `Изтриване на ${ids.length} ${ids.length === 1 ? 'сигнал' : 'сигнала'}`,
      message: 'Избраните сигнали и техните снимки ще бъдат премахнати окончателно. Действието е необратимо.',
      confirmText: 'Изтрий',
      cancelText: 'Отказ',
      variant: 'danger',
    });
    if (!ok) return;

    this.http.post<{ deleted: number; photosRemoved: number; message?: string }>(
      `${this.API}/admin/reports/bulk-delete`,
      { ids },
      this.authHeaders()
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.showToast(res?.message ?? `Изтрити ${res?.deleted ?? ids.length} сигнала.`);
          this.selectedReportIds.clear();
          this.isReportSelectMode = false;
          this.loadReports();
          this.loadStats();
        },
        error: () => this.showToast('Грешка при изтриване на сигналите', 'error'),
      });
  }

  /** Delete every report matching the current status / reportType filter
   *  (across ALL pages — not just the visible one). */
  async deleteAllFilteredReports(): Promise<void> {
    const filterParts: string[] = [];
    if (this.reportFilter.status) {
      const labels: Record<string, string> = {
        pending: 'чакащи',
        approved: 'одобрени',
        rejected: 'отхвърлени',
      };
      filterParts.push(labels[this.reportFilter.status] ?? this.reportFilter.status);
    }
    if (this.reportFilter.reportType) filterParts.push(`тип "${this.reportFilter.reportType}"`);
    const scope = filterParts.length ? filterParts.join(', ') : 'ВСИЧКИ';

    const ok = await this.confirmSvc.ask({
      title: `Изчистване на ${scope} сигнали`,
      message: `Това ще премахне окончателно ${scope === 'ВСИЧКИ' ? 'всички' : scope} сигнали и снимките им. Действието е необратимо.`,
      confirmText: 'Изчисти',
      cancelText: 'Отказ',
      variant: 'danger',
    });
    if (!ok) return;

    const qs = new URLSearchParams();
    if (this.reportFilter.status) qs.set('status', this.reportFilter.status);
    if (this.reportFilter.reportType) qs.set('reportType', this.reportFilter.reportType);
    const url = `${this.API}/admin/reports/delete-all${qs.toString() ? '?' + qs.toString() : ''}`;

    this.http.post<{ deleted: number; photosRemoved: number; message?: string }>(
      url, {}, this.authHeaders()
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.showToast(res?.message ?? `Изтрити ${res?.deleted ?? 0} сигнала.`);
          this.selectedReportIds.clear();
          this.isReportSelectMode = false;
          this.loadReports(1);
          this.loadStats();
        },
        error: () => this.showToast('Грешка при изчистване на сигналите', 'error'),
      });
  }

  openReportModal(report: Report): void {
    this.selectedReport = report;
    // Reset the photo error state every time a report is opened — otherwise
    // a previous failed load would keep the fallback shown for the next one.
    this.photoLoadFailed = false;
  }

  closeReportModal(): void {
    this.selectedReport = null;
    this.photoLoadFailed = false;
  }

  /** Called from the report modal's <img (error)> binding. Logs the failed
   *  URL so we can correlate against backend storage and flips the flag that
   *  swaps the image for the fallback message + direct link. */
  onPhotoError(photoURL: string | null): void {
    console.warn('Report photo failed to load:', this.getPhotoFullUrl(photoURL));
    this.photoLoadFailed = true;
  }

  openEditContainer(container: Container): void {
    this.editingContainer = { ...container };
  }

  saveContainer(): void {
    if (!this.editingContainer) return;

    this.http.put(
      `${this.API}/containers/${this.editingContainer.id}`,
      {
        fillPercentage: this.editingContainer.fillPercentage,
        status: this.editingContainer.status,
        hasSensor: this.editingContainer.hasSensor
      },
      this.authHeaders()
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast('Контейнерът е обновен');
          this.editingContainer = null;
          this.loadContainers();
        },
        error: () => this.showToast('Грешка при обновяване', 'error')
      });
  }

  closeContainerModal(): void {
    this.editingContainer = null;
  }

  emptyContainer(containerId: number): void {
    this.http.put(`${this.API}/containers/${containerId}/empty`, {}, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast('Контейнерът е изпразнен');
          this.loadContainers();
        },
        error: () => this.showToast('Грешка при изпразване', 'error')
      });
  }

  rechargeAllBatteries(): void {
    if (this.isResettingSensors) return;
    this.isResettingSensors = true;

    const targets = this.containers.filter(
      c => c.trashType !== 0 && c.batteryPercentage !== null
    );

    if (targets.length === 0) {
      this.showToast('Няма IoT сензори за презареждане', 'info');
      this.isResettingSensors = false;
      return;
    }

    let completed = 0;
    let hasError = false;

    targets.forEach(c => {
      this.http.put(
        `${this.API}/containers/${c.id}`,
        { fillPercentage: c.fillPercentage, status: 0, hasSensor: true },
        this.authHeaders()
      ).pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            completed++;
            if (completed === targets.length) {
              if (!hasError) {
                this.showToast(`Батериите на ${completed} IoT сензора са презаредени до 100%`);
              }
              this.isResettingSensors = false;
              this.loadContainers();
              this.loadStats();
            }
          },
          error: () => {
            hasError = true;
            completed++;
            if (completed === targets.length) {
              this.showToast('Някои сензори не бяха презаредени', 'error');
              this.isResettingSensors = false;
              this.loadContainers();
            }
          }
        });
    });
  }

  changeUserRole(user: User, newRole: string): void {
    const headers = this.authHeaders().headers
      .set('Content-Type', 'application/json');

    this.http.put(
      `${this.API}/admin/users/${user.id}/role`,
      JSON.stringify(newRole),
      { headers }
    )
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: () => {
        this.showToast(`Ролята на ${user.userName} е сменена на ${newRole}`);
        this.loadUsers();
      },
      error: () => this.showToast('Грешка при смяна на роля', 'error')
    });
  }

  openReputationModal(user: User): void {
    this.reputationModal = {
      user: { ...user },
      value: user.reputation
    };
  }

  closeReputationModal(): void {
    this.reputationModal = null;
  }

  saveReputation(): void {
    if (!this.reputationModal) return;

    const user = this.reputationModal.user;
    const value = this.reputationModal.value;

    const headers = this.authHeaders().headers
      .set('Content-Type', 'application/json');

    this.http.put(
      `${this.API}/admin/users/${user.id}/reputation`,
      JSON.stringify(value),
      { headers }
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`Репутацията на ${user.userName} е обновена на ${value}`);
          const updatedUser = { ...user, reputation: value };
          this.users = this.users.map(u => u.id === user.id ? updatedUser : u);
          this.filteredUsers = this.filteredUsers.map(u => u.id === user.id ? updatedUser : u);
          this.reputationModal = null;
        },
        error: () => this.showToast('Грешка при обновяване на репутация', 'error')
      });
  }

  viewUserReports(userId: string): void {
    this.activeTab = 'reports';
    this.reportSearch = userId;
    this.applyReportFilters();
  }

  buildUserReportCounts(): void {
    this.userReportCounts = this.reports.reduce((acc, r) => {
      acc[r.userId] = (acc[r.userId] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  getReportTypeText(type: string): string {
    const map: Record<string, string> = {
      Full: 'Пълен',
      Fire: 'Пожар',
      SensorBroken: 'Повреден сензор',
      TruckProblem: 'Проблем с камион',
      ContainerDamage: 'Повреден контейнер',
      MissingContainer: 'Заявка за нов контейнер'
    };
    return map[type] ?? type;
  }

  getReportTypeClass(type: string): string {
    if (type === 'Fire') return 'badge--danger';
    if (type === 'Full') return 'badge--warn';
    if (type === 'ContainerDamage') return 'badge--offline';
    if (type === 'TruckProblem') return 'badge--warn';
    if (type === 'MissingContainer') return 'badge--cyan';
    return 'badge--offline';
  }

  getTrashTypeText(type: number): string {
    return ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'][type] ?? 'Неизвестен';
  }

  getStatusText(status: number | null): string {
    if (status === null || status === undefined) return 'Активен';
    return (['Активен', 'Извън линия', 'Пожар', 'Повреден сензор'][status]) ?? 'Неизвестен';
  }

  getStatusClass(status: number | null): string {
    if (status === null || status === 0) return 'badge--eco';
    return (['badge--eco', 'badge--offline', 'badge--danger', 'badge--warn'])[status] ?? '';
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('bg-BG', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  getPhotoFullUrl(photoURL: string | null): string | null {
    if (!photoURL) return null;
    const base = this.API.replace(/\/api$/, '');
    return `${base}${photoURL}`;
  }

  openBanModal(user: User): void {
    this.banModal = { user, reason: '' };
  }

  closeBanModal(): void {
    this.banModal = null;
  }

  confirmBan(): void {
    if (!this.banModal) return;
    const { user, reason } = this.banModal;
    if (!reason.trim()) {
      this.showToast('Въведете причина за блокиране', 'error');
      return;
    }

    const headers = this.authHeaders().headers.set('Content-Type', 'application/json');
    this.http.put(
      `${this.API}/admin/users/${user.id}/ban`,
      JSON.stringify(reason.trim()),
      { headers }
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`${user.userName} е блокиран`);
          this.banModal = null;
          this.loadUsers();
        },
        error: (e) => this.showToast(e?.error?.message ?? 'Грешка при блокиране', 'error')
      });
  }

  unbanUser(user: User): void {
    this.http.put(`${this.API}/admin/users/${user.id}/unban`, {}, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`${user.userName} е деблокиран`);
          this.loadUsers();
        },
        error: () => this.showToast('Грешка при деблокиране', 'error')
      });
  }

  async deleteUser(user: User): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: `Изтриване на профила на ${user.userName}`,
      message: 'Профилът и всички свързани данни ще бъдат изтрити. Това действие е необратимо.',
      detail: `Email: ${user.email} · Репутация: ${user.reputation}`,
      confirmText: 'Изтрий профила',
      cancelText: 'Отказ',
      variant: 'danger',
      requireText: user.userName,
    });
    if (!ok) return;
    this.http.delete(`${this.API}/admin/users/${user.id}`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`Профилът на ${user.userName} е изтрит`);
          this.loadUsers();
        },
        error: () => this.showToast('Грешка при изтриване', 'error')
      });
  }

  updateTruckTrashType(truckId: number, trashType: number): void {
    const headers = this.authHeaders().headers.set('Content-Type', 'application/json');
    this.http.put(
      `${this.API}/admin/trucks/${truckId}/trashtype`,
      JSON.stringify(trashType),
      { headers }
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`Типът отпадък на камион #${truckId} е обновен`);
          const truck = this.trucks.find(t => t.id === truckId);
          if (truck) truck.trashType = trashType;
        },
        error: () => this.showToast('Грешка при обновяване на тип отпадък', 'error')
      });
  }

  exportReports(): void {
    const headers = ['ID', 'Тип', 'Контейнер', 'Потребител', 'Репутация', 'AI', 'Увереност', 'Дата', 'Статус'];
    const rows = this.filteredReports.map(r => [
      r.id,
      this.getReportTypeText(r.reportType),
      r.trashContainerId,
      r.userName,
      r.userReputationOnSubmit,
      r.aiScore,
      r.finalConfidence,
      this.formatDate(r.createdAt),
      r.isApproved === null ? 'Чакащ' : r.isApproved ? 'Одобрен' : 'Отхвърлен'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `binmaps-reports-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Thin wrapper over the global ToastService — kept so the rest of the
   * component can keep its short `this.showToast(...)` call sites.
   *
   *   showToast('Готово')                 → success toast
   *   showToast('Грешка...', 'error')     → danger toast
   *   showToast('Зареждам...', 'info')    → info toast
   */
  showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    const variant = type === 'error' ? 'danger' : type;
    this.toastSvc.show({ title: message, variant });
  }

  /** Legacy hook — toasts are now managed by ToastService and self-dismiss. */
  dismissToast(_id: number): void { /* no-op */ }

  private authHeaders(): { headers: HttpHeaders } {
    return this.authService.getAuthHeaders();
  }
}