import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
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

type ActiveTab = 'reports' | 'containers' | 'trucks' | 'users';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  containerSearch = '';
  userSearch = '';

  selectedReport: Report | null = null;
  editingContainer: Container | null = null;
  reputationModal: { user: User; value: number } | null = null;
  banModal: { user: User; reason: string } | null = null;

  toasts: Toast[] = [];
  private toastCounter = 0;

  isLoading = false;

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
    private readonly authService: AuthService
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
      users: () => this.loadUsers()
    };
    loaders[tab]();
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

  openReportModal(report: Report): void {
    this.selectedReport = report;
  }

  closeReportModal(): void {
    this.selectedReport = null;
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
      ContainerDamage: 'Повреден контейнер'
    };
    return map[type] ?? type;
  }

  getReportTypeClass(type: string): string {
    if (type === 'Fire') return 'badge--danger';
    if (type === 'Full') return 'badge--warn';
    if (type === 'ContainerDamage') return 'badge--offline';
    if (type === 'TruckProblem') return 'badge--warn';
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

  deleteUser(user: User): void {
    if (!confirm(`Изтриване на профила на ${user.userName}?`)) return;
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
    const id = ++this.toastCounter;
    this.toasts.push({ id, type, message });
    setTimeout(() => this.dismissToast(id), 3500);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  private authHeaders(): { headers: HttpHeaders } {
    return this.authService.getAuthHeaders();
  }
}