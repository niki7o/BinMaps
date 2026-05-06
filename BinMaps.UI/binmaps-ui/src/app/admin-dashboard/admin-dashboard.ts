import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ConfirmService } from '../shared/confirm-dialog/confirm.service';
import { ToastService } from '../shared/toast/toast.service';
import { LiveDriverTrackingService, LiveDriver } from '../services/live-driver-tracking.service';
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

interface Area {
  id: string;
  name: string;
  color: string;
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
  isSeeded: boolean;
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

  areas: Area[] = [];
  reports: Report[] = [];
  filteredReports: Report[] = [];
  containers: Container[] = [];
  filteredContainers: Container[] = [];
  deletedContainers: DeletedContainer[] = [];
  trucks: Truck[] = [];
  users: User[] = [];
  userRoleById: Record<string, string> = {};
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

  
  selectedReportIds = new Set<number>();

 
  isReportSelectMode = false;

  containerSearch = '';
  userSearch = '';

  selectedReport: Report | null = null;
  editingContainer: Container | null = null;
  reputationModal: { user: User; value: number } | null = null;
  banModal: { user: User; reason: string } | null = null;

 
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
    private readonly router: Router,
    private readonly liveDriverSvc: LiveDriverTrackingService,
  ) {}

  routesSubTab: 'live' | 'history' = 'live';

  get liveDrivers() { return this.liveDriverSvc.liveDrivers; }

  trackLiveDriver = (_: number, d: LiveDriver) => d.driverId;

  phaseLabel(phase: LiveDriver['phase']): string {
    switch (phase) {
      case 'start': return 'Старт';
      case 'stop':  return 'Спирка';
      case 'end':   return 'Край';
      default:      return 'В движение';
    }
  }


  stopsProgress(d: LiveDriver): number {
    if (!d.totalStops || d.totalStops <= 0) return 0;
    return Math.min(100, Math.round((d.stopIndex / d.totalStops) * 100));
  }

  
  capacityProgress(d: LiveDriver): number {
    if (!d.truck || d.truck.capacity <= 0) return 0;
    return Math.min(100, Math.round((d.load / d.truck.capacity) * 100));
  }

 
  capacityClass(d: LiveDriver): string {
    const pct = this.capacityProgress(d);
    if (pct >= 90) return 'progress__fill--critical';
    if (pct >= 70) return 'progress__fill--high';
    if (pct >= 50) return 'progress__fill--warn';
    return 'progress__fill--ok';
  }

  liveAgo(at: string): string {
    const ms = Date.now() - new Date(at).getTime();
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 5)  return 'току-що';
    if (sec < 60) return `преди ${sec} сек.`;
    const min = Math.round(sec / 60);
    return `преди ${min} мин.`;
  }

 
  goToDriverOnMap(driverId: string): void {
    this.router.navigate(['/map'], { queryParams: { focusDriver: driverId } });
  }

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        if (user?.role === 'Admin') {
          this.loadStats();
          this.loadReports();
          this.loadAreas();
          this.loadUsers();
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

  
  routeHistory: RouteRunSummary[] = [];
  filteredRoutes: RouteRunSummary[] = [];
  routeFilter: { status: string; areaId: string; driver: string } = {
    status: '',
    areaId: '',
    driver: '',
  };
  selectedRun: RouteRunDetail | null = null;
  isLoadingRoutes = false;

  routePage = 1;
  readonly routePageSize = 20;
  routeTotal = 0;

  get routeTotalPages(): number {
    return Math.max(1, Math.ceil(this.routeTotal / this.routePageSize));
  }

  get routePageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.routePage - 2);
    const end   = Math.min(this.routeTotalPages, this.routePage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  goToRoutePage(page: number): void {
    if (page < 1 || page > this.routeTotalPages) return;
    this.routePage = page;
    this.loadRouteHistory();
  }

  loadRouteHistory(): void {
    this.isLoadingRoutes = true;
    const skip = (this.routePage - 1) * this.routePageSize;
    const params: string[] = [`skip=${skip}`, `take=${this.routePageSize}`];
    if (this.routeFilter.status) params.push(`status=${this.routeFilter.status}`);
    if (this.routeFilter.areaId) params.push(`areaId=${encodeURIComponent(this.routeFilter.areaId)}`);
    if (this.routeFilter.driver) params.push(`driverId=${encodeURIComponent(this.routeFilter.driver)}`);

    const url = `${this.API}/trucks/route/history?${params.join('&')}`;
    this.http.get<{ items: RouteRunSummary[]; total: number }>(url, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.routeHistory  = data?.items ?? [];
          this.routeTotal    = data?.total ?? 0;
          this.filteredRoutes = this.routeHistory;
          this.isLoadingRoutes = false;
        },
        error: () => {
          this.isLoadingRoutes = false;
          this.showToast('Грешка при зареждане на маршрути', 'error');
        }
      });
  }

  applyRouteFilters(): void {
    this.routePage = 1;
    this.loadRouteHistory();
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

  async cancelRun(run: RouteRunSummary): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: 'Анулиране на маршрут',
      message: `Да анулирам ли активен маршрут #${run.id} (${run.driverName || run.driverId})?`,
      confirmText: 'Анулирай',
      cancelText: 'Отказ',
      variant: 'danger',
    });
    if (!ok) return;

    this.http.post(`${this.API}/trucks/route/${run.id}/cancel`, {}, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`Маршрут #${run.id} е анулиран`, 'success');
          this.loadRouteHistory();
        },
        error: () => this.showToast('Грешка при анулиране на маршрута', 'error'),
      });
  }

  async deleteRun(run: RouteRunSummary): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: 'Изтриване на маршрут',
      message: `Да изтрия ли завинаги маршрут #${run.id}? Действието не може да се отмени.`,
      confirmText: 'Изтрий',
      cancelText: 'Отказ',
      variant: 'danger',
    });
    if (!ok) return;

    this.http.delete(`${this.API}/trucks/route/${run.id}`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showToast(`Маршрут #${run.id} е изтрит`, 'success');
          if (this.routeHistory.length === 1 && this.routePage > 1) this.routePage--;
          this.loadRouteHistory();
        },
        error: () => this.showToast('Грешка при изтриване на маршрута', 'error'),
      });
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
    const ok = await this.confirmSvc.ask({
      title: 'Архивиране на контейнер',
      message: `Да архивирам ли контейнер #${c.id}?`,
      detail: 'Контейнерът ще бъде преместен в таб „Архивирани" откъдето може да бъде възстановен или изтрит окончателно.',
      confirmText: 'Архивирай',
      cancelText: 'Отказ',
      variant: 'warning',
    });
    if (!ok) return;

    this.http.delete<{ id: number; mode: string }>(
      `${this.API}/containers/${c.id}`, this.authHeaders()
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.containers = this.containers.filter(x => x.id !== c.id);
          this.filteredContainers = this.filteredContainers.filter(x => x.id !== c.id);
          this.showToast(`Контейнер #${c.id} е архивиран`, 'success');
          this.loadStats();
          this.loadDeletedContainers();
        },
        error: err => this.showToast(
          `Грешка: ${err?.error?.message ?? 'неуспешно архивиране'}`, 'error'
        )
      });
  }

  async purgeContainer(id: number): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: `Окончателно изтриване на контейнер #${id}`,
      message: 'Това действие е необратимо. Контейнерът и всички свързани сигнали ще бъдат изтрити за постоянно.',
      confirmText: 'Изтрий окончателно',
      cancelText: 'Отказ',
      variant: 'danger',
      requireText: `DELETE ${id}`,
    });
    if (!ok) return;

    this.http.delete<{ id: number; reportsRemoved: number }>(
      `${this.API}/admin/containers/${id}/permanent`, this.authHeaders()
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.deletedContainers = this.deletedContainers.filter(c => c.id !== id);
          const extra = res?.reportsRemoved ? ` (${res.reportsRemoved} сигнала изтрити)` : '';
          this.showToast(`Контейнер #${id} е изтрит окончателно${extra}`, 'success');
          this.loadStats();
        },
        error: err => this.showToast(
          `Грешка: ${err?.error?.message ?? 'неуспешно окончателно изтриване'}`, 'error'
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

  loadAreas(): void {
    this.http.get<Area[]>(`${this.API}/areas`, this.authHeaders())
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: data => this.areas = data });
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
        
          this.userRoleById = {};
          for (const u of data) this.userRoleById[u.id] = u.role;
          this.isLoading = false;
        },
        error: () => {
          this.showToast('Грешка при зареждане на потребители', 'error');
          this.isLoading = false;
        }
      });
  }

  
  isPrivilegedRole(role: string | undefined | null): boolean {
    return role === 'Admin' || role === 'Driver';
  }


  isPrivilegedUserId(userId: string | undefined | null): boolean {
    if (!userId) return false;
    return this.isPrivilegedRole(this.userRoleById[userId]);
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


  isReportSelected(reportId: number): boolean {
    return this.selectedReportIds.has(reportId);
  }

  toggleReportSelection(reportId: number): void {
    if (this.selectedReportIds.has(reportId)) {
      this.selectedReportIds.delete(reportId);
    } else {
      this.selectedReportIds.add(reportId);
    }
  }

 
  get allVisibleReportsSelected(): boolean {
    if (this.filteredReports.length === 0) return false;
    return this.filteredReports.every(r => this.selectedReportIds.has(r.id));
  }


  get someVisibleReportsSelected(): boolean {
    const anySelected = this.filteredReports.some(r => this.selectedReportIds.has(r.id));
    return anySelected && !this.allVisibleReportsSelected;
  }

 
  get selectedReportCount(): number {
    return this.selectedReportIds.size;
  }

 
  toggleSelectAllReports(): void {
    if (this.allVisibleReportsSelected) {
      this.filteredReports.forEach(r => this.selectedReportIds.delete(r.id));
    } else {
      this.filteredReports.forEach(r => this.selectedReportIds.add(r.id));
    }
  }


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

  
  exitReportSelectMode(): void {
    this.selectedReportIds.clear();
    this.isReportSelectMode = false;
  }


  enterReportSelectMode(): void {
    if (this.filteredReports.length === 0) return;
    this.isReportSelectMode = true;
    this.selectedReportIds.clear();
    
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
 
    this.photoLoadFailed = false;
  }

  closeReportModal(): void {
    this.selectedReport = null;
    this.photoLoadFailed = false;
  }

 
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
        hasSensor: this.editingContainer.hasSensor,
        areaId: this.editingContainer.areaId
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

  async rechargeAllBatteries(): Promise<void> {
    if (this.isResettingSensors) return;

    const LOW_BATTERY_THRESHOLD = 20;
    const targets = this.containers.filter(
      c => c.hasSensor && c.batteryPercentage !== null && c.batteryPercentage <= LOW_BATTERY_THRESHOLD
    );

    if (targets.length === 0) {
      this.showToast('Няма сензори с ниска батерия (≤ 20%)', 'info');
      return;
    }

    const ok = await this.confirmSvc.ask({
      title: 'Подмяна на батерии',
      message: `Ще бъдат подменени батериите на ${targets.length} сензора с ниска батерия (≤ 20%). Батериите ще бъдат заредени последователно, симулирайки посещение на поддръжка.`,
      confirmText: 'Стартирай поддръжка',
      cancelText: 'Отказ',
      variant: 'info',
    });
    if (!ok) return;

    this.isResettingSensors = true;
    let completed = 0;
    let hasError = false;

    for (const c of targets) {
      await new Promise<void>(resolve => {
        this.http.put(
          `${this.API}/containers/${c.id}`,
          { fillPercentage: c.fillPercentage, status: c.status ?? 0, hasSensor: true, batteryPercentage: 100 },
          this.authHeaders()
        ).pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => { completed++; resolve(); },
            error: () => { hasError = true; completed++; resolve(); }
          });
        });
      await new Promise(r => setTimeout(r, 400));
    }

    if (!hasError) {
      this.showToast(`Батериите на ${completed} сензора са подменени до 100%`, 'success');
    } else {
      this.showToast('Някои сензори не бяха презаредени', 'error');
    }
    this.isResettingSensors = false;
    this.loadContainers();
    this.loadStats();
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

  private trashIdx(type: number | string | null | undefined): number {
    if (type === null || type === undefined) return 0;
    if (typeof type === 'number') return type;
    return ({ Mixed: 0, Plastic: 1, Paper: 2, Glass: 3 } as Record<string, number>)[type] ?? 0;
  }

  getTrashTypeText(type: number | string | null | undefined): string {
    return ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'][this.trashIdx(type)] ?? 'Смесен';
  }

  trashTypeLabel(t: number | string | null | undefined): string {
    const labels = ['Общ', 'Пластмаса', 'Хартия', 'Стъкло'];
    return labels[this.trashIdx(t)] ?? 'Общ';
  }

  getStatusText(status: number | null): string {
    if (status === null || status === undefined) return 'Активен';
    return (['Активен', 'Извън линия', 'Пожар', 'Повреден сензор'][status]) ?? 'Активен';
  }

  getStatusClass(status: number | null): string {
    if (status === null || status === 0) return 'badge--eco';
    return (['badge--eco', 'badge--offline', 'badge--danger', 'badge--warn'])[status] ?? 'badge--eco';
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

  
  showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    const variant = type === 'error' ? 'danger' : type;
    this.toastSvc.show({ title: message, variant });
  }

  
  dismissToast(_id: number): void { /* no-op */ }

  private authHeaders(): { headers: HttpHeaders } {
    return this.authService.getAuthHeaders();
  }
}