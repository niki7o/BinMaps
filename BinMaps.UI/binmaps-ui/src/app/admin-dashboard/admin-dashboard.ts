import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../auth.service';

interface Report {
  id: number;
  trashContainerId: number;
  userId: string;
  userName: string;
  reportType: string;
  ai_Score: number;
  userReputationOnSubmit: number;
  finalConfidence: number;
  isApproved: boolean;
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
  roles: string[];
  reputation: number;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboardComponent implements OnInit {
  activeTab: 'reports' | 'containers' | 'trucks' | 'users' = 'reports';

  reports: Report[] = [];
  filteredReports: Report[] = [];
  containers: Container[] = [];
  trucks: Truck[] = [];
  users: User[] = [];
  stats: any = {};
  userCount = 0;
  userReportCounts: { [key: string]: number } = {};

  reportFilter = {
    status: '',
    reportType: '',
    fromDate: '',
    toDate: ''
  };

  selectedReport: Report | null = null;
  selectedReportPhoto: string | null = null;
  editingContainer: Container | null = null;

  constructor(private http: HttpClient, private authService: AuthService) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user && user.role === 'Admin') {
        this.loadData();
      }
    });
  }

  private getAuthHeaders() {
  return this.authService.getAuthHeaders();
}

  setActiveTab(tab: 'reports' | 'containers' | 'trucks' | 'users') {
    this.activeTab = tab;
    if (tab === 'reports') this.loadReports();
    if (tab === 'containers') this.loadContainers();
    if (tab === 'trucks') this.loadTrucks();
    if (tab === 'users') this.loadUsers();
  }

  loadData() {
    this.loadStats();
    this.loadReports();
  }

  loadStats() {
    this.http.get('https://localhost:7277/api/admin/stats', this.getAuthHeaders()).subscribe({
      next: (data: any) => (this.stats = data),
      error: err => console.error('Error loading stats:', err)
    });
  }

  loadReports() {
    this.http.get<Report[]>('https://localhost:7277/api/admin/reports', this.getAuthHeaders()).subscribe({
      next: data => {
        this.reports = data;
        this.filteredReports = [...data];
        this.calculateUserReportCounts();
      },
      error: err => console.error('Error loading reports:', err)
    });
  }

  loadContainers() {
    this.http.get<Container[]>('https://localhost:7277/api/admin/containers', this.getAuthHeaders()).subscribe({
      next: data => (this.containers = data),
      error: err => console.error('Error loading containers:', err)
    });
  }

  loadTrucks() {
    this.http.get<Truck[]>('https://localhost:7277/api/admin/trucks', this.getAuthHeaders()).subscribe({
      next: data => (this.trucks = data),
      error: err => console.error('Error loading trucks:', err)
    });
  }

  loadUsers() {
    this.http.get<User[]>('https://localhost:7277/api/admin/users', this.getAuthHeaders()).subscribe({
      next: data => {
        this.users = data;
        this.userCount = data.length;
      },
      error: err => console.error('Error loading users:', err)
    });
  }

  calculateUserReportCounts() {
    this.userReportCounts = {};
    this.reports.forEach(report => {
      if (report.userId) {
        this.userReportCounts[report.userId] = (this.userReportCounts[report.userId] || 0) + 1;
      }
    });
  }

  filterReports() {
    let filtered = [...this.reports];
    if (this.reportFilter.status === 'pending') filtered = filtered.filter(r => !r.isApproved);
    if (this.reportFilter.status === 'approved') filtered = filtered.filter(r => r.isApproved);
    if (this.reportFilter.reportType) filtered = filtered.filter(r => r.reportType === this.reportFilter.reportType);
    if (this.reportFilter.fromDate) {
      const from = new Date(this.reportFilter.fromDate);
      filtered = filtered.filter(r => new Date(r.createdAt) >= from);
    }
    if (this.reportFilter.toDate) {
      const to = new Date(this.reportFilter.toDate);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => new Date(r.createdAt) <= to);
    }
    this.filteredReports = filtered;
  }

  approveReport(reportId: number) {
    if (!confirm('Сигурни ли сте, че искате да одобрите този репорт?')) return;
    this.http.post(`https://localhost:7277/api/admin/reports/${reportId}/approve`, {}, this.getAuthHeaders()).subscribe({
      next: () => {
        alert('Репортът е одобрен');
        this.loadReports();
        this.closeModal();
      },
      error: err => {
        console.error('Error approving report:', err);
        alert('Грешка при одобряване на репорт');
      }
    });
  }

  rejectReport(reportId: number) {
    if (!confirm('Сигурни ли сте, че искате да отхвърлите този репорт?')) return;
    this.http.post(`https://localhost:7277/api/admin/reports/${reportId}/reject`, {}, this.getAuthHeaders()).subscribe({
      next: () => {
        alert('Репортът е отхвърлен');
        this.loadReports();
        this.closeModal();
      },
      error: err => {
        console.error('Error rejecting report:', err);
        alert('Грешка при отхвърляне на репорт');
      }
    });
  }

  viewReportDetails(report: Report) {
    this.selectedReport = report;
  }

  closeModal() {
    this.selectedReport = null;
    this.selectedReportPhoto = null;
  }

  editContainer(container: Container) {
    this.editingContainer = { ...container };
  }

  saveContainer() {
    if (!this.editingContainer) return;
    this.http.put(`https://localhost:7277/api/admin/containers/${this.editingContainer.id}`, {
      fillPercentage: this.editingContainer.fillPercentage,
      status: this.editingContainer.status,
      hasSensor: this.editingContainer.hasSensor
    }, this.getAuthHeaders()).subscribe({
      next: () => {
        alert('Кофата е обновена');
        this.loadContainers();
        this.closeContainerModal();
      },
      error: err => {
        console.error('Error updating container:', err);
        alert('Грешка при обновяване на кофа');
      }
    });
  }

  closeContainerModal() {
    this.editingContainer = null;
  }

  viewTruckRoute(truckId: number) {
    window.open(`/map?truck=${truckId}`, '_blank');
  }

  viewUserReports(userId: string) {
    this.activeTab = 'reports';
    this.reportFilter = { status: '', reportType: '', fromDate: '', toDate: '' };
    this.filteredReports = this.reports.filter(r => r.userId === userId);
  }

  adjustUserReputation(user: User) {
    const newRep = prompt(`Въведете нова репутация за ${user.userName} (0-100):`, user.reputation.toString());
    if (newRep !== null) {
      const rep = parseInt(newRep);
      if (!isNaN(rep) && rep >= 0 && rep <= 100) {
        alert(`Репутацията на ${user.userName} е променена на ${rep}`);
      } else alert('Невалидна стойност за репутация');
    }
  }

  getReportTypeText(type: string) {
    const types: { [key: string]: string } = { 'Full': 'Препълнена', 'Fire': 'Пожар', 'SensorBroken': 'Повреден сензор' };
    return types[type] || type;
  }

  getReportTypeClass(type: string) {
    if (type === 'Fire') return 'fire';
    if (type === 'Full') return 'full';
    return 'sensor';
  }

  getTrashTypeText(type: number) {
    const types = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'];
    return types[type] || 'Неизвестен';
  }

  getTrashTypeClass(type: number) {
    const classes = ['mixed', 'plastic', 'paper', 'glass'];
    return classes[type] || '';
  }

  getStatusText(status: number | null) {
    if (status === null || status === undefined) return 'Нормален';
    const statuses = ['Активен', 'Пожар', 'Повреден', 'Извън линия'];
    return statuses[status] || 'Неизвестен';
  }

  getStatusClass(status: number | null) {
    if (status === null || status === undefined) return 'normal';
    if (status === 1) return 'fire';
    if (status === 2) return 'damaged';
    if (status === 3) return 'offline';
    return 'active';
  }

  formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('bg-BG', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }


  getInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  getRoleText(role: string): string {
    const roleLabels: { [key: string]: string } = {
      'Admin': 'Администратор',
      'Driver': 'Шофьор',
      'User': 'Потребител'
    };
    return roleLabels[role] || 'Потребител';
  }
}