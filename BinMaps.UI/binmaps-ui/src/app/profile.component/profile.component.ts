import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

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
  isApproved: boolean;
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

  private apiUrl = 'https://localhost:7277/api';

  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
  
    const token = this.getAuthToken();
    if (!token) {
      console.error('No auth token found - redirecting to login');
      this.router.navigate(['/login']);
      return;
    }

    this.loadProfile();
    this.loadReports();
    this.loadReputation();
  }



  private getAuthToken(): string | null {
  
    const token = localStorage.getItem('token');
    if (token) {
      return token;
    }

    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        return user.token || null;
      } catch (e) {
        console.error('Failed to parse user data', e);
      }
    }

    return null;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.getAuthToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  private loadProfile() {
    const headers = this.getAuthHeaders();
    
    this.http.get<UserProfile>(`${this.apiUrl}/UserProfile`, { headers }).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.editForm = {
          userName: profile.userName,
          email: profile.email,
          phoneNumber: profile.phoneNumber || ''
        };
        this.loading = false;
        console.log('Profile loaded successfully:', profile);
      },
      error: (err) => {
        console.error('Failed to load profile:', err);
        this.loading = false;
        
        if (err.status === 401) {
          alert('Сесията ви е изтекла. Моля влезте отново.');
          this.authService.logout();
          this.router.navigate(['/login']);
        }
      }
    });
  }

  private loadReports() {
    const headers = this.getAuthHeaders();
    
    this.http.get<Report[]>(`${this.apiUrl}/UserProfile/reports`, { headers }).subscribe({
      next: (reports) => {
        this.reports = reports;
        console.log('Reports loaded:', reports.length);
      },
      error: (err) => {
        console.error('Failed to load reports:', err);
        if (err.status === 401) {
          console.log('Unauthorized - session expired');
        }
      }
    });
  }

  private loadReputation() {
    const headers = this.getAuthHeaders();
    
    this.http.get<ReputationInfo>(`${this.apiUrl}/UserProfile/reputation`, { headers }).subscribe({
      next: (info) => {
        this.reputationInfo = info;
        console.log('Reputation loaded:', info);
      },
      error: (err) => {
        console.error('Failed to load reputation:', err);
        if (err.status === 401) {
          console.log('Unauthorized - session expired');
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
    const headers = this.getAuthHeaders();

    this.http.put(`${this.apiUrl}/UserProfile`, this.editForm, { headers }).subscribe({
      next: (response: any) => {
        console.log('Profile updated:', response);
        this.loadProfile();
        this.editMode = false;
        this.savingProfile = false;
        alert('Профилът е актуализиран успешно!');
      },
      error: (err) => {
        console.error('Failed to update profile:', err);
        this.savingProfile = false;
        
        if (err.status === 401) {
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
      reader.onload = (e: any) => {
        this.previewUrl = e.target.result;
      };
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

    const token = this.getAuthToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
      
    });

    this.http.post<any>(`${this.apiUrl}/UserProfile/upload-picture`, formData, { headers }).subscribe({
      next: (response) => {
        console.log('Picture uploaded:', response);
        this.loadProfile();
        this.selectedFile = null;
        this.previewUrl = null;
        this.uploadingPicture = false;
        alert('Снимката е качена успешно!');
      },
      error: (err) => {
        console.error('Failed to upload picture:', err);
        this.uploadingPicture = false;
        
        if (err.status === 401) {
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
    if (!confirm('Сигурни ли сте, че искате да изтриете профилната си снимка?')) {
      return;
    }

    const headers = this.getAuthHeaders();

    this.http.delete(`${this.apiUrl}/UserProfile/picture`, { headers }).subscribe({
      next: () => {
        this.loadProfile();
        alert('Снимката е изтрита');
      },
      error: (err) => {
        console.error('Failed to delete picture:', err);
        
        if (err.status === 401) {
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
    const types: { [key: number]: string } = {
      0: 'Препълнен',
      1: 'Пожар',
      2: 'Счупен сензор',
      3: 'Проблем с камион',
      4: 'Повреден контейнер'
    };
    return types[type] || 'Неизвестен';
  }

  getReportTypeClass(type: number): string {
    const classes: { [key: number]: string } = {
      0: 'type-full',
      1: 'type-fire',
      2: 'type-sensor',
      3: 'type-truck',
      4: 'type-damage'
    };
    return classes[type] || 'type-default';
  }

  getTrashTypeLabel(type: number): string {
    const types = ['Смесен', 'Пластмаса', 'Хартия', 'Стъкло'];
    return types[type] || 'Неизвестен';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('bg-BG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatMemberSince(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('bg-BG', {
      year: 'numeric',
      month: 'long'
    });
  }

  getAccuracyRate(): number {
    if (!this.profile || this.profile.totalReports === 0) return 0;
    return Math.round((this.profile.approvedReports / this.profile.totalReports) * 100);
  }

  getLevelColor(level: string): string {
    const colors: { [key: string]: string } = {
      'Легенда': '#8b5cf6',
      'Експерт': '#f59e0b',
      'Професионалист': '#3b82f6',
      'Опитен': '#10b981',
      'Активен': '#6ee7b7',
      'Начинаещ': '#94a3b8'
    };
    return colors[level] || '#94a3b8';
  }

  getRoleLabel(role: string): string {
    const roles: { [key: string]: string } = {
      'Admin': 'Администратор',
      'Driver': 'Шофьор',
      'User': 'Потребител'
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