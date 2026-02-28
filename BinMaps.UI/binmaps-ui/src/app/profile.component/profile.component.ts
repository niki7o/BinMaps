import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface UserProfile {
  userId: string;
  userName: string;
  email: string;
  phoneNumber: string | null;
  profilePicturePath: string | null;
  role: string;
  totalReports: number;
  approvedReports: number;
  reputation: number;
  level: string;
  memberSince: string;
}

interface Report {
  id: number;
  reportType: number;
  description: string;
  createdAt: string;
  isApproved: boolean | null;
  ai_Score: number;
  finalConfidence: number;
  containerId: number | null;
  container: {
    id: number;
    areaId: string;
    trashType: number;
  } | null;
}

interface ReputationInfo {
  reputation: number;
  level: string;
  nextLevel: number;
  progress: number;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {

  profile: UserProfile | null = null;
  reports: Report[] = [];
  reputationInfo: ReputationInfo | null = null;
  unlockedBadgeIds = new Set<string>();

  loading = true;
  editMode = false;
  uploadingPicture = false;
  savingProfile = false;

  editForm = {
    userName: '',
    email: '',
    phoneNumber: ''
  };

  selectedFile: File | null = null;
  previewUrl: string | null = null;

  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    if (!this.authService.getToken()) {
      this.router.navigate(['/login']);
      return;
    }

    this.loadProfile();
    this.loadReports();
    this.loadReputation();
  }

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  private computeBadges(): void {
    const ids = new Set<string>();
    const total = this.profile?.totalReports ?? 0;
    const hasFireReport = this.reports.some(r => r.reportType === 1);
    const hasBrokenReport = this.reports.some(r => r.reportType === 4 || r.reportType === 2);
    const rep = this.reputationInfo?.reputation ?? 0;
    if (total >= 1)      ids.add('first-step');
    if (total >= 5)      ids.add('observer');
    if (total >= 20)     ids.add('reporter');
    if (hasFireReport)   ids.add('firefighter');
    if (hasBrokenReport) ids.add('detective');
    if (total >= 50)     ids.add('guardian');
    if (rep >= 95)       ids.add('legend');
    this.unlockedBadgeIds = ids;
  }

  private loadProfile() {
    this.http.get<UserProfile>(`${this.apiUrl}/UserProfile`, { headers: this.getAuthHeaders() }).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.editForm = {
          userName: profile.userName,
          email: profile.email,
          phoneNumber: profile.phoneNumber || ''
        };
        this.loading = false;
        this.computeBadges();
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 401 || err.status === 403) {
          alert('Сесията ви е изтекла. Моля влезте отново.');
          this.authService.logout();
          this.router.navigate(['/login']);
        }
      }
    });
  }

  private loadReports() {
    this.http.get<Report[]>(`${this.apiUrl}/UserProfile/reports`, { headers: this.getAuthHeaders() }).subscribe({
      next: (reports) => { this.reports = reports; this.computeBadges(); },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/login']);
        }
      }
    });
  }

  private loadReputation() {
    this.http.get<ReputationInfo>(`${this.apiUrl}/UserProfile/reputation`, { headers: this.getAuthHeaders() }).subscribe({
      next: (info) => { this.reputationInfo = info; this.computeBadges(); },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
          this.authService.logout();
          this.router.navigate(['/login']);
        }
      }
    });
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (!this.editMode && this.profile) {
      this.editForm = {
        userName: this.profile.userName,
        email: this.profile.email,
        phoneNumber: this.profile.phoneNumber || ''
      };
    }
  }

  saveProfile() {
    this.savingProfile = true;
    this.http.put(`${this.apiUrl}/UserProfile`, this.editForm, { headers: this.getAuthHeaders() }).subscribe({
      next: () => {
        this.loadProfile();
        this.editMode = false;
        this.savingProfile = false;
        alert('Профилът е актуализиран успешно!');
      },
      error: (err) => {
        this.savingProfile = false;
        if (err.status === 401 || err.status === 403) {
          alert('Сесията ви е изтекла. Моля влезте отново.');
          this.authService.logout();
          this.router.navigate(['/login']);
        } else {
          alert('Грешка при актуализация на профила');
        }
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFile = input.files[0];
      const reader = new FileReader();
      reader.onload = (e: any) => this.previewUrl = e.target.result;
      reader.readAsDataURL(this.selectedFile);
    }
  }

  uploadPicture() {
    if (!this.selectedFile) {
      alert('Моля изберете файл');
      return;
    }

    this.uploadingPicture = true;
    const formData = new FormData();
    formData.append('file', this.selectedFile);

    this.http.post<any>(`${this.apiUrl}/UserProfile/upload-picture`, formData, { 
      headers: new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` }) 
    }).subscribe({
      next: () => {
        this.loadProfile();
        this.selectedFile = null;
        this.previewUrl = null;
        this.uploadingPicture = false;
        alert('Снимката е качена успешно!');
      },
      error: (err) => {
        this.uploadingPicture = false;
        if (err.status === 401 || err.status === 403) {
          alert('Сесията ви е изтекла. Моля влезте отново.');
          this.authService.logout();
          this.router.navigate(['/login']);
        } else {
          alert(err.error?.error || 'Грешка при качване на снимката');
        }
      }
    });
  }

  deletePicture() {
    if (!confirm('Сигурни ли сте, че искате да изтриете профилната си снимка?')) return;
    this.http.delete(`${this.apiUrl}/UserProfile/picture`, { headers: this.getAuthHeaders() }).subscribe({
      next: () => {
        this.loadProfile();
        alert('Снимката е изтрита');
      },
      error: (err) => {
        if (err.status === 401 || err.status === 403) {
          alert('Сесията ви е изтекла. Моля влезте отново.');
          this.authService.logout();
          this.router.navigate(['/login']);
        } else {
          alert('Грешка при изтриване на снимката');
        }
      }
    });
  }

  cancelPictureUpload() {
    this.selectedFile = null;
    this.previewUrl = null;
  }

  getProfilePictureUrl(): string {
    if (this.profile?.profilePicturePath) {
      return `${this.apiUrl.replace('/api', '')}${this.profile.profilePicturePath}`;
    }
    return 'assets/icons/avatar.svg';
  }

  getReportTypeLabel(type: number): string {
    const types: Record<number, string> = {
      0: 'Препълнен', 1: 'Пожар', 2: 'Счупен сензор',
      3: 'Проблем с камион', 4: 'Повреден контейнер'
    };
    return types[type] || 'Неизвестен';
  }

  getReportTypeClass(type: number): string {
    const classes: Record<number, string> = {
      0: 'type-full', 1: 'type-fire', 2: 'type-sensor',
      3: 'type-truck', 4: 'type-damage'
    };
    return classes[type] || 'type-default';
  }

  getTrashTypeLabel(type: number): string {
    return ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'][type] || 'Неизвестен';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('bg-BG', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  formatMemberSince(dateString: string): string {
    return new Date(dateString).toLocaleDateString('bg-BG', { year: 'numeric', month: 'long' });
  }

  getAccuracyRate(): number {
    if (!this.profile || this.profile.totalReports === 0) return 0;
    return Math.round((this.profile.approvedReports / this.profile.totalReports) * 100);
  }

  getRoleLabel(role: string): string {
    const roles: Record<string, string> = {
      'Admin': 'Администратор', 'Driver': 'Шофьор', 'User': 'Потребител'
    };
    return roles[role] || role;
  }

  navigateToMap() {
    this.router.navigate(['/map']);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}